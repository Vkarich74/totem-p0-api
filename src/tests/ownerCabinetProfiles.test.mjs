// Route-level tests of the EXISTING /salons/:slug and /masters/:slug APIs.
// Pure in-memory SQL adapter: never connect to PostgreSQL or create a salon.
import test from "node:test";
import assert from "node:assert/strict";
import buildSalonsRouter from "../routes/internal/salons.js";
import buildMastersRouter from "../routes/internal/masters.js";
import {
  ownerProfileRevision, validateOwnerProfilePatch,
  canonicalOwnerProfile,
} from "../services/ownerCabinetProfile.service.js";

class MockCoreDB {
  constructor() {
    this.salon = {
      id: 77, slug: "existing-salon", name: "Existing salon",
      description: "Описание", city: "Бишкек",
      phone: "+996555123456", logo_url: null,
    };
    this.master = {
      id: 88, slug: "existing-master", user_id: 9, name: "Existing master",
    };
    this.writes = 0;
    this.rollbacks = 0;
    this.statements = [];
    this.billingBlocked = false;
    this.corruptReadback = false;
    this.marketCode = "KG";
  }
  async query(sql, params = []) {
    return this._run(sql,params);
  }
  async connect() {
    const root = this;
    let snapshot = null;
    return {
      async query(sql,params=[]) {
        const q = String(sql).replace(/\s+/g, " ").trim();
        if (q === "BEGIN") {
          snapshot = {
            salon: {...root.salon},
            master: {...root.master},
            writes: root.writes,
          };
          root.statements.push(q);
          return {rows:[]};
        }
        if (q === "COMMIT") {
          root.statements.push(q);
          snapshot = null;
          return {rows:[]};
        }
        if (q === "ROLLBACK") {
          root.statements.push(q);
          root.rollbacks++;
          if (snapshot) {
            root.salon = snapshot.salon;
            root.master = snapshot.master;
            root.writes = snapshot.writes;
          }
          snapshot = null;
          return {rows:[]};
        }
        return root._run(sql,params);
      },
      release() {},
    };
  }
  async _run(statement, params) {
    const sql = String(statement).replace(/\s+/g, " ").trim();
    this.statements.push(sql);
    if (sql.startsWith("SET LOCAL")) return {rows:[]};
    if (sql.includes("FROM public.salons WHERE slug=$1")) {
      return {rows: params[0] === this.salon.slug ? [{...this.salon}] : []};
    }
    if (sql.includes("FROM public.salons WHERE id=$1")) {
      const row = this.corruptReadback && this.writes
        ? {...this.salon,name:"CORRUPTED_NAME"} : {...this.salon};
      return {rows: params[0] === this.salon.id ? [row] : []};
    }
    if (sql.includes("FROM public.owner_salon os")) {
      return {rows:params[0] === this.salon.id && String(params[1]) === "9"
        ? [{email:"owner@existing.example"}] : []};
    }
    if (sql.includes("FROM public.masters m WHERE m.slug=$1") ||
        sql.includes("FROM public.masters WHERE slug=$1")) {
      return {rows:params[0] === this.master.slug ? [{...this.master}] : []};
    }
    if (sql.includes("FROM public.masters WHERE id=$1")) {
      return {rows:params[0] === this.master.id ? [{...this.master}] : []};
    }
    if (sql.includes("FROM public.master_salon ms") &&
        sql.includes("JOIN public.salons s")) return {rows:[]};
    if (sql.includes("FROM public.auth_users") && sql.includes("role='master'")) {
      return {rows:Number(params[0])===9
        ? [{email:"master@existing.example"}] : []};
    }
    if (sql.includes("FROM public.billing_subscriptions")) {
      return {rows:this.billingBlocked ? [{
        subscription_status:"blocked",blocked_at:"2026-01-01"
      }] : []};
    }
    if (sql.includes("FROM public.tenant_market_settings t")) {
      return {rows:[{code:this.marketCode}]};
    }
    if (sql.startsWith("UPDATE public.salons")) {
      this.salon={
        ...this.salon,name:params[1],description:params[2]||null,
        city:params[3]||null,phone:params[4]||null,logo_url:params[5]||null,
      };
      this.writes++;
      return {rows:[],rowCount:1};
    }
    if (sql.startsWith("UPDATE public.masters")) {
      this.master.name=params[1];
      this.writes++;
      return {rows:[],rowCount:1};
    }
    throw new Error("UNEXPECTED_SQL:"+sql.slice(0,200));
  }
}

function request(ownerType, overrides={}) {
  return {
    params:{slug:ownerType==="salon"?"existing-salon":"existing-master"},
    auth:{
      source:"session",
      role:ownerType==="salon"?"salon_admin":"master",
      user_id:9,
    },
    identity:{user_id:9,salons:[77],masters:[88]},
    body:null,...overrides,
  };
}
async function dispatch(db,ownerType,verb,req) {
  const router = ownerType==="salon"
    ? buildSalonsRouter(db, (_req,_res,next)=>next())
    : buildMastersRouter(db, (_req,_res,next)=>next());
  const path=ownerType==="salon"?"/salons/:slug":"/masters/:slug";
  const layer=router.stack.find(entry =>
    entry.route?.path===path && entry.route?.methods?.[verb.toLowerCase()]);
  assert.ok(layer,"EXISTING_CORE_ROUTE_MISSING "+verb+" "+path);
  const res = {
    statusCode:200,body:null,
    status(code){this.statusCode=code;return this;},
    json(payload){this.body=payload;return this;},
  };
  await layer.route.stack.at(-1).handle(req,res);
  return {status:res.statusCode,body:res.body};
}
const get=(db,kind,overrides={}) =>
  dispatch(db,kind,"get",request(kind,overrides));
const patch=(db,kind,body,overrides={}) =>
  dispatch(db,kind,"patch",request(kind,{...overrides,body}));

function payload(response,updates={}) {
  const kind=response.body.salon?"salon":"master";
  const fields=kind==="salon"
    ?["name","description","city","phone","logo_url"]:["name"];
  return {
    revision:response.body.profile_revision,
    profile:Object.fromEntries(fields.map(key=>[
      key,updates[key]??response.body.profile[key]
    ])),
  };
}

test("shared field contract blocks unknown email/OTP/bio changes",()=>{
  const before=ownerProfileRevision("master",{name:"Name"});
  assert.equal(before.length,64);
  assert.deepEqual(canonicalOwnerProfile("master",{name:"Name"}),{name:"Name"});
  const bad=validateOwnerProfilePatch("master",{
    revision:before,profile:{name:"Name",email:"evil@example.com"}
  });
  assert.equal(bad.ok,false);
  assert.equal(bad.error,"PROFILE_FIELDS_UNSUPPORTED");
});

test("existing GET root preserves salon/master fields and returns profile metadata",async()=>{
  const db=new MockCoreDB();
  const salon=await get(db,"salon");
  const master=await get(db,"master");
  assert.equal(salon.status,200,JSON.stringify(salon));
  assert.equal(master.status,200,JSON.stringify(master));
  assert.equal(salon.body.salon.id,77);
  assert.equal(master.body.master.id,88);
  assert.equal(salon.body.profile.email,"owner@existing.example");
  assert.equal(master.body.profile.email,"master@existing.example");
  assert.deepEqual(master.body.profile_editable_fields,["name"]);
  assert.equal(db.writes,0);
});

test("salon profile persists through canonical PATCH and fresh GET",async()=>{
  const db=new MockCoreDB();
  const before=await get(db,"salon");
  const saved=await patch(db,"salon",payload(before,{
    name:"Салон обновлён",description:"Новый текст",city:"Ош",
  }));
  assert.equal(saved.status,200,JSON.stringify(saved));
  assert.equal(saved.body.profile_saved,true);
  const after=await get(db,"salon");
  assert.equal(after.body.profile.name,"Салон обновлён");
  assert.equal(after.body.profile.city,"Ош");
  assert.equal(after.body.profile_revision,saved.body.profile_revision);
  assert.notEqual(before.body.profile_revision,after.body.profile_revision);
  assert.equal(db.writes,1);
});

test("master profile writes existing masters.name, never a sidecar",async()=>{
  const db=new MockCoreDB();
  const before=await get(db,"master");
  const saved=await patch(db,"master",payload(before,{name:"Новое имя"}));
  assert.equal(saved.status,200,JSON.stringify(saved));
  assert.equal((await get(db,"master")).body.profile.name,"Новое имя");
  assert.equal(db.writes,1);
  assert.ok(!db.statements.some(x=>/CREATE TABLE|INSERT INTO/.test(x)));
});

test("no cross-owner access, legacy JWT write, or extra-field overwrite",async()=>{
  const db=new MockCoreDB();
  for (const kind of ["salon","master"]) {
    const before=await get(db,kind);
    const data=payload(before,{name:"Danger"});
    assert.equal((await patch(db,kind,data,{
      identity:{user_id:9,salons:[],masters:[]}
    })).status,403);
    assert.equal((await patch(db,kind,data,{
      auth:{source:"jwt_legacy",role:kind==="salon"?"salon_admin":"master",user_id:9}
    })).status,403);
    assert.equal((await patch(db,kind,{
      ...data,profile:{...data.profile,email:"hijack@example.com"}
    })).status,400);
  }
  assert.equal(db.writes,0);
});

test("blocked billing, stale revision, and readback disagreement fail closed",async()=>{
  const db=new MockCoreDB();
  const before=await get(db,"salon");
  db.billingBlocked=true;
  assert.equal((await patch(db,"salon",payload(before,{name:"Denied"}))).status,403);
  assert.equal(db.writes,0);
  db.billingBlocked=false;
  assert.equal((await patch(db,"salon",payload(before,{name:"Updated"}))).status,200);
  const persisted=db.writes;
  const stale=await patch(db,"salon",payload(before,{name:"Stale"}));
  assert.equal(stale.status,409);
  assert.equal(stale.body.error,"PROFILE_REVISION_CONFLICT");
  assert.equal(db.writes,persisted);

  const canonical=await get(db,"salon");
  db.corruptReadback=true;
  const mismatch=await patch(db,"salon",payload(canonical,{name:"Corrupted"}));
  assert.equal(mismatch.status,409,JSON.stringify(mismatch));
  assert.equal(mismatch.body.error,"PROFILE_STORAGE_READBACK_MISMATCH");
  assert.equal(db.writes,persisted);
  assert.equal(db.salon.name,"Updated");
  assert.ok(db.rollbacks>=1);
});

test("offline fixture created no salons or external connections",()=>{
  const db=new MockCoreDB();
  assert.equal(db.salon.slug,"existing-salon");
  assert.equal(typeof db.connect,"function");
});
