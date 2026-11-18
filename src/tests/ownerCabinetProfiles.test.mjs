// Fully in-memory, pure-query fake. Never connects to PostgreSQL.
// No CREATE/INSERT statements; no test owner or salon is provisioned.
import test from "node:test";
import assert from "node:assert/strict";
import {
  cabinetProfileRevision, validateCabinetProfileBody,
  readOwnerCabinetProfile, saveOwnerCabinetProfile,
} from "../services/ownerCabinetProfile.service.js";

const SESSION = "0bd4e4da-cb47-4d5e-8651-5f50086d7c13";
const DEFAULT_SALON = Object.freeze({
  id: 17, slug: "existing-owner", name: "Existing Owner",
  description: "Открыто", city: "Бишкек",
  phone: "+996555123456", logo_url: null,
});
const DEFAULT_MASTER = Object.freeze({
  id: 28, slug: "existing-master", name: "Existing Master",
});
const salonOpts = () => ({
  ownerType: "salon", ownerSlug: "existing-owner",
  auth: { source: "session", role: "salon_admin", user_id: 9,
    session_id: SESSION },
  identity: { user_id: 9 },
});
const masterOpts = () => ({
  ownerType: "master", ownerSlug: "existing-master",
  auth: { source: "session", role: "master", user_id: 9,
    session_id: SESSION },
  identity: { user_id: 9 },
});

class InMemoryPool {
  constructor() {
    this.salon = { ...DEFAULT_SALON };
    this.master = { ...DEFAULT_MASTER };
    this.blocked = false;
    this.market = "KG";
    this.sessionEnabled = true;
    this.corruptReadback = false;
    this.calls = [];
    this.writes = 0;
    this.commits = 0;
    this.rollbacks = 0;
  }
  async connect() {
    const pool = this;
    let before = null;
    return {
      async query(text, values = []) {
        const sql = String(text).replace(/\s+/g, " ").trim();
        pool.calls.push(sql);
        if (sql.startsWith("BEGIN")) {
          before = {salon: {...pool.salon}, master: {...pool.master}};
          return {rows:[]};
        }
        if (sql === "COMMIT") {
          pool.commits++;
          before = null;
          return {rows:[]};
        }
        if (sql === "ROLLBACK") {
          pool.rollbacks++;
          if (before) {
            pool.salon = before.salon;
            pool.master = before.master;
          }
          before = null;
          return {rows:[]};
        }
        if (sql.startsWith("SET LOCAL")) return {rows:[]};
        if (sql.includes("FROM public.auth_sessions sess")) {
          return {rows:pool.sessionEnabled ? [{email:"owner@existing.example"}] : []};
        }
        if (sql.includes("FROM public.salons s") &&
            sql.includes("JOIN public.owner_salon os")) {
          const yes = values[0] === pool.salon.slug &&
            String(values[1]) === "9";
          const row = pool.corruptReadback
            ? {...pool.salon,name:"CORRUPTED_READBACK"} : {...pool.salon};
          return {rows: yes ? [row] : []};
        }
        if (sql.includes("FROM public.masters m") &&
            sql.includes("m.user_id=$2")) {
          const yes = values[0] === pool.master.slug &&
            Number(values[1]) === 9;
          return {rows:yes ? [{...pool.master}] : []};
        }
        if (sql.includes("FROM public.billing_subscriptions")) {
          return {rows:pool.blocked ? [{blocked_at:"2026-01-01"}] : []};
        }
        if (sql.includes("FROM public.tenant_market_settings t")) {
          return {rows:[{code:pool.market}]};
        }
        if (sql.startsWith("UPDATE public.salons")) {
          if (pool.corruptReadback) return {rows:[]};
          pool.salon = {
            ...pool.salon, name: values[1], description: values[2] || null,
            city: values[3] || null, phone: values[4] || null,
            logo_url: values[5] || null,
          };
          pool.writes++;
          return {rowCount:1, rows:[]};
        }
        if (sql.startsWith("UPDATE public.masters")) {
          pool.master.name = values[1];
          pool.writes++;
          return {rowCount:1,rows:[]};
        }
        throw new Error("TEST_UNEXPECTED_SQL:" + sql.slice(0,120));
      },
      release() {},
    };
  }
}
function salonWrite(fromRead, overrides = {}) {
  const {email: _discard, ...editable} = fromRead.body.profile;
  return {
    ...salonOpts(),
    body: {
      revision:fromRead.body.revision,
      profile:{...editable,...overrides},
    },
  };
}
function masterWrite(fromRead, name) {
  return {...masterOpts(),body:{
    revision:fromRead.body.revision,profile:{name},
  }};
}

test("schema is an exact closed allowlist: no email, OTP or scheduling writes", () => {
  const rev = "a".repeat(64);
  const master = validateCabinetProfileBody("master", {
    revision:rev,profile:{name:"Новый мастер",bio:"NOT_PERSISTED"}
  });
  assert.equal(master.error,"PROFILE_FIELDS_UNSUPPORTED");
  const salon = validateCabinetProfileBody("salon",{
    revision:rev,profile:{name:"Салон",description:"",city:"",phone:"",
      logo_url:"",email:"attacker@example.com"}
  });
  assert.equal(salon.error,"PROFILE_FIELDS_UNSUPPORTED");
  assert.equal(cabinetProfileRevision("master",{name:"A"}).length,64);
});

test("GET reads only direct salon ownership and session login email",async()=>{
  const db = new InMemoryPool();
  const r = await readOwnerCabinetProfile(db,salonOpts());
  assert.equal(r.status,200);
  assert.equal(r.body.profile.name,"Existing Owner");
  assert.equal(r.body.profile.phone,"+996555123456");
  assert.equal(r.body.profile.email,"owner@existing.example");
  assert.equal(r.body.can_write,true);
  assert.equal(db.writes,0);
  assert.ok(db.calls.includes("BEGIN READ ONLY"));
  assert.ok(db.calls.some(s=>s.includes("JOIN public.owner_salon os")));
});

test("GET/PATCH rejects foreign owner, role mismatch and revoked session",async()=>{
  const db = new InMemoryPool();
  const foreign=await readOwnerCabinetProfile(db,{
    ...salonOpts(),ownerSlug:"another-owner"
  });
  assert.equal(foreign.status,404);
  const changedIdentity=await readOwnerCabinetProfile(db,{
    ...salonOpts(),identity:{user_id:23}
  });
  assert.equal(changedIdentity.status,403);
  const jwt=await readOwnerCabinetProfile(db,{
    ...salonOpts(),auth:{source:"jwt_legacy",role:"salon_admin",user_id:9}
  });
  assert.equal(jwt.status,403);
  db.sessionEnabled=false;
  assert.equal((await readOwnerCabinetProfile(db,salonOpts())).status,403);
  assert.equal(db.writes,0);
});

test("salon PATCH really persists only existing columns and separate GET confirms",async()=>{
  const db=new InMemoryPool();
  const original=await readOwnerCabinetProfile(db,salonOpts());
  const updated=await saveOwnerCabinetProfile(db,salonWrite(original,{
    name:"  Салон Бишкек  ",description:"Первая линия",
    city:"Ош",logo_url:"https://example.com/logo.png"
  }));
  assert.equal(updated.status,200,JSON.stringify(updated));
  assert.equal(updated.body.saved,true);
  assert.equal(updated.body.profile.name,"Салон Бишкек");
  assert.equal(updated.body.profile.city,"Ош");
  assert.equal(db.writes,1);
  const reread=await readOwnerCabinetProfile(db,salonOpts());
  assert.equal(reread.body.profile.name,"Салон Бишкек");
  assert.equal(reread.body.profile.logo_url,"https://example.com/logo.png");
  assert.equal(reread.body.revision,updated.body.revision);
  assert.notEqual(reread.body.revision,original.body.revision);
  assert.equal(db.commits>=2,true);
});

test("stale revision rejects without UPDATE, then valid revision persists",async()=>{
  const db=new InMemoryPool();
  const original=await readOwnerCabinetProfile(db,salonOpts());
  const a=await saveOwnerCabinetProfile(db,salonWrite(original,{city:"Ош"}));
  assert.equal(a.status,200);
  const writes=db.writes;
  const stale=await saveOwnerCabinetProfile(db,salonWrite(original,{city:"Нарын"}));
  assert.equal(stale.status,409);
  assert.equal(stale.body.error,"PROFILE_REVISION_CONFLICT");
  assert.equal(db.writes,writes);
  const fresh=await readOwnerCabinetProfile(db,salonOpts());
  assert.equal(fresh.body.profile.city,"Ош");
});

test("blocked billing forbids salon and master changes",async()=>{
  const db=new InMemoryPool();
  const salon=await readOwnerCabinetProfile(db,salonOpts());
  const master=await readOwnerCabinetProfile(db,masterOpts());
  db.blocked=true;
  assert.equal((await saveOwnerCabinetProfile(db,salonWrite(salon,{city:"Ош"}))).status,403);
  assert.equal((await saveOwnerCabinetProfile(db,masterWrite(master,"New Name"))).status,403);
  assert.equal(db.writes,0);
});

test("master name persists with verified ownership, no master-sidecar table",async()=>{
  const db=new InMemoryPool();
  const original=await readOwnerCabinetProfile(db,masterOpts());
  assert.deepEqual(original.body.editable_fields,["name"]);
  assert.ok(original.body.unsupported_fields.includes("bio"));
  const saved=await saveOwnerCabinetProfile(db,masterWrite(original,"Новое имя"));
  assert.equal(saved.status,200);
  const check=await readOwnerCabinetProfile(db,masterOpts());
  assert.equal(check.body.profile.name,"Новое имя");
  assert.equal(check.body.revision,saved.body.revision);
  assert.ok(!db.calls.some(s=>/CREATE TABLE|INSERT INTO/.test(s)));
});

test("US salon contact fails closed on wrong country and rolls back",async()=>{
  const db=new InMemoryPool();
  db.market="US";
  const original=await readOwnerCabinetProfile(db,salonOpts());
  const bad=await saveOwnerCabinetProfile(db,salonWrite(original,{
    phone:"+14162564567"
  }));
  assert.equal(bad.status,400);
  assert.equal(bad.body.error,"PROFILE_PHONE_INVALID");
  assert.equal(db.writes,0);
  const again=await readOwnerCabinetProfile(db,salonOpts());
  assert.equal(again.body.profile.phone,original.body.profile.phone);
});

test("readback disagreement produces rollback and no successful acknowledgement",async()=>{
  const db=new InMemoryPool();
  const original=await readOwnerCabinetProfile(db,salonOpts());
  db.corruptReadback=true;
  const result=await saveOwnerCabinetProfile(db,salonWrite(original,{
    name:"Different"
  }));
  assert.equal(result.status,409);
  assert.equal(result.body.error,"PROFILE_REVISION_CONFLICT");
  assert.equal(db.writes,0);
  assert.equal(db.salon.name,"Existing Owner");
});
