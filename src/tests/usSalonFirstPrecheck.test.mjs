import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenOwnerPrecheck } from "../routes/internal/adminOpenOwner.js";
import { normalizeContactPhoneForBusiness } from "../services/contactPhone.js";
import {
  assertUsOpenOwnerContract, assertUsActivationReady, readUsSalon
} from "../services/provision/usOpenOwnerGuards.js";

// No real database, API, owner, credentials, or production network used.
class USFixturePool {
  constructor(salonMarket = "US", readyLocation = false) {
    this.salonMarket = salonMarket;
    this.readyLocation = readyLocation;
    this.statements = [];
  }
  async query(statement, values = []) {
    const sql = String(statement).replace(/\s+/g, " ").toLowerCase();
    this.statements.push(sql);
    if (sql.includes("from public.salons s") &&
        sql.includes("tenant_market_settings")) {
      return { rows: [{
        id: 701, slug: "us-studio", name: "US Studio",
        market_code: this.salonMarket, market_active: true,
        enabled: true, status: "active",
      }] };
    }
    if (sql.includes("from public.salons") &&
        sql.includes("lower(slug)")) {
      return { rows: sql.includes("select id, slug, name") && values[0] === "us-studio"
        ? [{ id: 701, slug: "us-studio", name: "US Studio" }] : [] };
    }
    if (sql.includes("from public.masters master")) return { rows: [{ salon_id: 701 }] };
    if (sql.includes("from public.masters")) return { rows: [] };
    if (sql.includes("from public.slug_reservations")) return { rows: [] };
    if (sql.includes("from public.auth_users")) return { rows: [] };
    if (sql.includes("from public.markets") &&
        sql.includes("code='us'")) return { rows: [{ code: "US" }] };
    if (sql.includes("from public.us_salon_locations")) {
      return { rows: this.readyLocation ? [{ id: 991 }] : [] };
    }
    throw new Error("UNEXPECTED_FIXTURE_QUERY:" + sql.slice(0, 150));
  }
}
const contact = "+12133734253";
const salon = {
  owner_type: "salon", market_code: "US",
  name: "US Studio", slug: "us-studio-new",
  email: "studio@us-fixture.example", phone: contact,
  city: "New York", state_code: "NY", postal_code: "10001",
};
const master = {
  owner_type: "master", market_code: "US",
  name: "US Master", slug: "us-master-new",
  email: "master@us-fixture.example", phone: contact,
  city: "New York", work_mode: "attached_to_salon",
  salon_slug: "us-studio",
};

test("US salon precheck uses strict state, ZIP, market and phone without DB writes", async () => {
  const db = new USFixturePool();
  const valid = await buildOpenOwnerPrecheck(db, salon);
  assert.equal(valid.valid, true, JSON.stringify(valid));
  assert.equal(valid.normalized.market_code, "US");
  assert.equal(valid.normalized.state_code, "NY");
  assert.equal(valid.normalized.postal_code, "10001");
  assert.equal(valid.normalized.phone_normalized, contact);
  assert.equal(db.statements.some(x => /insert |update |delete /.test(x)), false);
});
test("US salon cannot pass with missing or invalid state and ZIP", async () => {
  const db = new USFixturePool();
  const result = await buildOpenOwnerPrecheck(db, {
    ...salon, state_code: "PR", postal_code: "bad",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("INVALID_US_STATE"));
  assert.ok(result.errors.includes("INVALID_US_ZIP"));
});
test("US master cannot work independently or without an active US salon", async () => {
  const db = new USFixturePool();
  const independent = await buildOpenOwnerPrecheck(db, { ...master, work_mode: "independent" });
  assert.equal(independent.valid, false);
  assert.ok(independent.errors.includes("WORK_MODE_INVALID"));
  const missing = await buildOpenOwnerPrecheck(db, { ...master, salon_slug: "" });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.includes("SALON_SLUG_REQUIRED"));
  const valid = await buildOpenOwnerPrecheck(db, master);
  assert.equal(valid.valid, true, JSON.stringify(valid));
});
test("US master cannot bind to salon from another market", async () => {
  const db = new USFixturePool("KG");
  const result = await buildOpenOwnerPrecheck(db, master);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("US_ACTIVE_SALON_REQUIRED"));
});
test("Canadian NANP +1 number is rejected for US but KG legacy stays general", async () => {
  const db = new USFixturePool();
  const bad = await buildOpenOwnerPrecheck(db, { ...salon, phone: "+14162564567" });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.includes("INVALID_US_PHONE"));
  const normalized = await normalizeContactPhoneForBusiness(db, contact, {marketCode:"US"});
  assert.deepEqual(normalized, {ok:true,phone:contact});
  const kg = await buildOpenOwnerPrecheck(db, {
    owner_type:"master",name:"KG Master",slug:"kg-master-new",
    email:"kg@fixture.example",phone:"+996555123456",city:"Бишкек"
  });
  assert.equal(kg.valid,true,JSON.stringify(kg));
  assert.equal(kg.normalized.work_mode,"independent");
});
test("US market and master relation are checked again before provisioning", async () => {
  const db = new USFixturePool();
  const pre = await buildOpenOwnerPrecheck(db, master);
  assert.equal(pre.valid,true);
  const request = {
    owner_type:"master",work_mode:"attached_to_salon",salon_slug:"us-studio",
    phone_normalized:contact,precheck_result_json:pre,
  };
  assert.equal(await assertUsOpenOwnerContract(db,request),true);
  await assert.rejects(
    assertUsOpenOwnerContract(new USFixturePool("KG"),request),
    e => e.code==="US_ACTIVE_SALON_REQUIRED"
  );
  assert.equal((await readUsSalon(db,"us-studio")).market_code,"US");
});
test("US master activation stays blocked without verified primary salon location", async () => {
  const db = new USFixturePool();
  const request = {
    owner_type:"master",work_mode:"attached_to_salon",salon_slug:"us-studio",
    precheck_result_json:{normalized:{market_code:"US"}}
  };
  await assert.rejects(
    assertUsActivationReady(db,request,802),
    e => e.code === "US_LOCATION_NOT_READY"
  );
});
