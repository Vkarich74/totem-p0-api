// G5-T3 focused source/guard tests. Does not touch any PostgreSQL or Odoo.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertUsPaidEvidenceForLockedRequest, activateOwnerOpeningCanonical,
} from "../src/services/provision/ownerOpeningCanonicalActivation.js";
import { prepareUsPaidActivationEvidence } from
  "../src/services/provision/usPaidOwnerOpeningGate.js";

const from="2026-01-01T00:00:00.000Z";
const until="2027-12-01T00:00:00.000Z";
function request(market="US",change={}) {
  return {
    id:71,owner_type:"salon",status:"provisioned",
    created_owner_id:301,created_auth_user_id:401,
    source_namespace:market==="US"?"odoo_online":null,
    source_company_id:market==="US"?4:null,
    source_website_id:market==="US"?5:null,
    source_partner_id:market==="US"?99:null,
    source_request_id:market==="US"?"approved-77":null,
    precheck_result_json:{market_code:market},...change,
  };
}
function receipt(r,change={}) {
  return {
    status:"PAID_VERIFIED",canActivate:true,
    companyId:4,websiteId:5,
    requestId:r.id,createdOwnerId:r.created_owner_id,
    createdAuthUserId:r.created_auth_user_id,
    sourceRequestId:r.source_request_id,
    ownerType:r.owner_type,partnerId:Number(r.source_partner_id),
    verifiedAtUtc:new Date().toISOString(),
    periodStartUtc:from,periodEndExclusiveUtc:until,
    subscriptionOrderId:601,invoiceId:701,commercialPolicyVersion:"owner_v1",
    ...change,
  };
}
function mockPool(r) {
  const calls=[];
  let entityWrites=0;
  let auditWrites=0;
  let released=false;
  const context={
    async query(statement,args=[]) {
      const sql=String(statement);
      calls.push(sql.trim().replace(/\s+/g," ").slice(0,75));
      if (sql==="BEGIN"||sql==="ROLLBACK"||sql==="COMMIT") return {rows:[]};
      if (sql.includes("SELECT * FROM public.owner_opening_requests")) {
        return {rows:[{...r}]};
      }
      if (sql.includes("SELECT clock_timestamp()")) {
        return {rows:[{now:new Date()}]};
      }
      if (sql.includes("UPDATE public.auth_users SET enabled=true")) {
        return {rows:[{id:args[0]}]};
      }
      if (sql.includes("UPDATE public.owner_opening_requests SET status")) {
        return {rows:[{...r,status:"activated"}]};
      }
      throw Error("UNEXPECTED_TEST_SQL");
    },
    release(){released=true;},
  };
  const handlers={
    getMarketCode:x=>x.precheck_result_json.market_code,
    assertMarketPolicy:()=>{},
    assertUsActivationReady:async()=>{},
    activateEntity:async (_db,x)=>{
      entityWrites++;
      return {owner_id:x.created_owner_id};
    },
    writeAudit:async(_db,data)=>{
      auditWrites++;
      return {id:91};
    },
  };
  return {
    pool:{connect:async()=>context},
    handlers,
    calls,
    get entityWrites(){return entityWrites;},
    get auditWrites(){return auditWrites;},
    get released(){return released;},
  };
}
async function run(mock,r,evidence,custom={}) {
  return activateOwnerOpeningCanonical({
    pool:mock.pool,requestId:r.id,admin:{id:55},
    paidEvidence:evidence,...mock.handlers,...custom,
  });
}
test("valid paid source and fresh UTC receipt passes pure guard",()=>{
  const r=request();
  assert.doesNotThrow(()=>assertUsPaidEvidenceForLockedRequest(
    r,receipt(r),new Date()));
});
test("missing payment denies before any Core SQL write",()=>{
  assert.throws(()=>assertUsPaidEvidenceForLockedRequest(
    request(),null,new Date()),/US_ODOO_PAID_ENTITLEMENT_REQUIRED/);
});
test("cross-partner, company, site and role evidence denied",()=>{
  const r=request();
  for(const change of [
    {partnerId:88},{companyId:2},{websiteId:6},
    {ownerType:"master"},{sourceRequestId:"wrong"},{requestId:500},
  ]) {
    assert.throws(()=>assertUsPaidEvidenceForLockedRequest(
      r,receipt(r,change),new Date()),/US_ODOO_PAYMENT_SOURCE_CHANGED/);
  }
});
test("wrong Core user, wrong Core entity cannot borrow payment",()=>{
  const r=request();
  for(const change of [{createdOwnerId:999},{createdAuthUserId:999}]) {
    assert.throws(()=>assertUsPaidEvidenceForLockedRequest(
      r,receipt(r,change),new Date()),/US_ODOO_PAYMENT_SOURCE_CHANGED/);
  }
});
test("expired period and stale Odoo receipt deny full access",()=>{
  const r=request();
  for(const change of [
    {periodEndExclusiveUtc:"2025-01-01T00:00:00.000Z"},
    {verifiedAtUtc:new Date(Date.now()-30000).toISOString()},
  ]) {
    assert.throws(()=>assertUsPaidEvidenceForLockedRequest(
      r,receipt(r,change),new Date()),/STALE_OR_EXPIRED/);
  }
});
test("US paid Admin uses one canonical transaction and one audit",async()=>{
  const r=request();const m=mockPool(r);
  const result=await run(m,r,receipt(r));
  assert.equal(result.request.status,"activated");
  assert.equal(m.entityWrites,1);
  assert.equal(m.auditWrites,1);
  assert.ok(m.calls[0]==="BEGIN");
  assert.ok(m.calls.some(x=>x.includes("FOR UPDATE")));
  assert.ok(m.calls.includes("COMMIT"));
  assert.equal(m.calls.includes("ROLLBACK"),false);
  assert.equal(m.released,true);
});
test("US without paid readback rolls back and never calls entity activation",async()=>{
  const r=request();const m=mockPool(r);
  await assert.rejects(()=>run(m,r,null),/PAID_ENTITLEMENT_REQUIRED/);
  assert.equal(m.entityWrites,0);
  assert.equal(m.auditWrites,0);
  assert.ok(m.calls.includes("ROLLBACK"));
  assert.equal(m.calls.includes("COMMIT"),false);
});
test("valid paid request never skips Geo/owner guard",async()=>{
  const r=request();const m=mockPool(r);
  await assert.rejects(()=>run(m,r,receipt(r),{
    assertUsActivationReady:async()=>{throw Error("GEO_MISSING");},
  }),/GEO_MISSING/);
  assert.equal(m.entityWrites,0);
  assert.ok(m.calls.includes("ROLLBACK"));
});
test("legacy KG activation remains independent of Odoo payments",async()=>{
  const r=request("KG");const m=mockPool(r);
  const result=await run(m,r,null);
  assert.equal(result.request.status,"activated");
  assert.equal(m.entityWrites,1);
  assert.ok(m.calls.includes("COMMIT"));
  assert.equal(m.calls.some(x=>x.includes("UPDATE public.auth_users")),false);
});
test("typed US source cannot masquerade as KG and avoid payment",async()=>{
  const r=request("KG",{source_namespace:"odoo_online",
    source_company_id:4,source_website_id:5,
    source_partner_id:99,source_request_id:"approved-77"});
  const m=mockPool(r);
  await assert.rejects(()=>run(m,r,null),/US_ODOO_SOURCE_MARKET_MISMATCH/);
  assert.equal(m.entityWrites,0);
  assert.ok(m.calls.includes("ROLLBACK"));
});
test("nonprovisioned request cannot activate from any invoice",async()=>{
  const r=request("US",{status:"approved"});const m=mockPool(r);
  await assert.rejects(()=>run(m,r,receipt(r)),/STATUS_INVALID/);
  assert.equal(m.entityWrites,0);
});
test("activated request is idempotent; no second audit or entity operation",async()=>{
  const r=request("KG",{status:"activated"});const m=mockPool(r);
  const result=await run(m,r,null);
  assert.equal(result.idempotent,true);
  assert.equal(m.entityWrites,0);
  assert.equal(m.auditWrites,0);
});
test("audit failure aborts same Core transaction after entity call",async()=>{
  const r=request("US");const m=mockPool(r);
  await assert.rejects(()=>run(m,r,receipt(r),{
    writeAudit:async()=>{throw Error("AUDIT_FAILED");},
  }),/AUDIT_FAILED/);
  assert.ok(m.calls.includes("ROLLBACK"));
  assert.equal(m.calls.includes("COMMIT"),false);
});
test("payment preflight disabled is fail-closed without any Odoo HTTP call",async()=>{
  const r=request();let called=false;
  const result=await prepareUsPaidActivationEvidence(r,{
    env:{},createClient:()=>{called=true;throw Error("SHOULD_NOT_CALL");},
  });
  assert.equal(result.canActivate,false);
  assert.equal(called,false);
});
test("source preflight requires approved role and correct US identity",async()=>{
  const r=request();const fakeEnv={
    TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED:"true",
    TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON:JSON.stringify({
      approved:true,coveredOwnerTypes:["salon"],
    }),
  };
  const invalid=await prepareUsPaidActivationEvidence({
    ...r,source_company_id:1,
  },{env:fakeEnv});
  assert.equal(invalid.canActivate,false);
  const master=await prepareUsPaidActivationEvidence({
    ...r,owner_type:"master",
  },{env:fakeEnv});
  assert.equal(master.reason,"US_ODOO_ROLE_COMMERCIAL_POLICY_UNAPPROVED");
});
test("Odoo with no paid order / multiple active orders cannot authorize",async()=>{
  const r=request();
  const env={
    TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED:"true",
    TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON:JSON.stringify({
      approved:true,coveredOwnerTypes:["salon"],
    }),
    TOTEM_US_ODOO_URL:"https://example.odoo.com",
    TOTEM_US_ODOO_DB:"fixture",TOTEM_US_ODOO_USER:"fixture",
    TOTEM_US_ODOO_API_KEY:"fixture",
  };
  for(const orders of [[],[{id:601},{id:602}]]) {
    let verified=false;
    const result=await prepareUsPaidActivationEvidence(r,{
      env,createClient:()=>({searchRead:async()=>orders}),
      verify:async()=>{verified=true;return {status:"PAID_VERIFIED",canActivate:true};},
    });
    assert.equal(result.canActivate,false);
    assert.equal(verified,false);
  }
});
test("Admin /activate source delegates to one shared service after Odoo paid preflight",async()=>{
  const body=await readFile(new URL(
    "../src/routes/internal/adminOpenOwner.js",import.meta.url),"utf8");
  assert.equal((body.match(/r\.post\("\/requests\/:id\/activate"/g)||[]).length,1);
  assert.ok(body.includes("prepareUsPaidActivationEvidence(candidate)"));
  assert.ok(body.includes("activateOwnerOpeningCanonical({"));
  assert.ok(body.indexOf("prepareUsPaidActivationEvidence(candidate)") <
    body.indexOf("activateOwnerOpeningCanonical({"));
});
