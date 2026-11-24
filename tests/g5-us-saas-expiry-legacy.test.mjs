// G5-T5: offline test suite, no real Odoo/Stripe/Gmail/Production writes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assessUsSaasProjection,getUsSaasAccess,readUsSaasProjectionPolicy,
  persistUsSaasPaidProjection,revokeUsSaasProjection,
} from "../src/services/billing/usSaasEntitlementProjection.js";
import { classifyUsSaasInternalWrite,buildUsSaasCommercialGuard } from
  "../src/middleware/usSaasCommercialGuard.js";
import { assertUsPaidEvidenceForLockedRequest } from
  "../src/services/provision/ownerOpeningCanonicalActivation.js";
import { reconcileUsSaasOpening } from "../src/services/billing/usSaasReconciliation.js";

const NOW="2026-11-24T08:00:00.000Z";
const BEFORE="2026-11-01T00:00:00.000Z";
const UNTIL="2026-12-01T00:00:00.000Z";
const ageLimit=300000;
const policy={version:"policy_owner_signed_v1",maxEvidenceAgeMs:ageLimit};
function owner(changes={}){
  return {id:11,owner_type:"salon",status:"email_sent",
    source_namespace:"odoo_online",source_company_id:4,source_website_id:5,
    source_partner_id:41,source_request_id:"odoo-source-88",
    created_owner_id:100,created_auth_user_id:200,...changes};
}
function row(changes={}){
  return {id:55,owner_type:"salon",owner_id:100,
    provider_namespace:"odoo_online",provider_company_id:4,
    provider_website_id:5,provider_partner_id:41,
    provider_source_request_id:"odoo-source-88",
    provider_subscription_order_id:777,provider_invoice_id:888,
    provider_policy_version:policy.version,
    provider_verified_at:"2026-11-24T07:59:00.000Z",
    provider_revoked_at:null,subscription_status:"active",wallet_only:false,
    currency:"USD",blocked_at:null,
    current_period_start:BEFORE,current_period_end:UNTIL,...changes};
}
function evidence(changes={}){
  return {status:"PAID_VERIFIED",canActivate:true,
    requestId:11,createdOwnerId:100,createdAuthUserId:200,
    sourceRequestId:"odoo-source-88",ownerType:"salon",
    partnerId:41,companyId:4,websiteId:5,
    verifiedAtUtc:"2026-11-24T07:59:59.000Z",
    periodStartUtc:BEFORE,periodEndExclusiveUtc:UNTIL,
    subscriptionOrderId:777,invoiceId:888,
    commercialPolicyVersion:policy.version,...changes};
}
const evaluate=(billing,source=owner(),changes={})=>
  assessUsSaasProjection(billing,{marketUs:true,source,now:NOW,policy,...changes});
test("active verified US paid account permits business access",()=>{
  const a=evaluate(row());
  assert.equal(a.managed,true);assert.equal(a.can_write,true);
  assert.equal(a.can_book,true);assert.equal(a.paid_until,UNTIL);
});
test("exact UTC period cutoff revokes immediately, no weekly cron wait",()=>{
  const a=evaluate(row(),owner(),{now:UNTIL});
  assert.equal(a.can_write,false);
  assert.equal(a.reason,"US_SAAS_PAID_PERIOD_EXPIRED_OR_NOT_STARTED");
});
test("unpaid before start and missing period are blocked",()=>{
  for(const x of [
    row({current_period_start:"2026-11-25T00:00:00.000Z"}),
    row({current_period_end:null}),
  ])assert.equal(evaluate(x).can_book,false);
});
test("5-min source readback TTL fails closed when Odoo reconciliation delayed",()=>{
  const b=row({provider_verified_at:"2026-11-24T07:54:59.000Z"});
  assert.equal(evaluate(b).reason,"US_SAAS_EVIDENCE_STALE");
  assert.equal(evaluate(row({provider_verified_at:"2026-11-24T07:55:00.000Z"})).can_write,true);
});
test("refunded, cancelled, blocked or grace projection never grants US rights",()=>{
  for(const patch of [
    {subscription_status:"blocked"},{subscription_status:"cancelled"},
    {subscription_status:"grace"},{blocked_at:NOW},
    {provider_revoked_at:NOW},
  ])assert.equal(evaluate(row(patch)).can_write,false);
});
test("US billing projection absent cannot fall back to legacy active",()=>{
  assert.equal(evaluate(null).reason,"US_SAAS_PROJECTION_MISSING_OR_MISMATCH");
});
test("untrusted Odoo company/site/partner/provider/policy is denied",()=>{
  for(const billing of [
    row({provider_partner_id:999}),
    row({provider_company_id:2}),row({provider_website_id:4}),
    row({provider_namespace:null}),
    row({provider_policy_version:"other"}),
    row({wallet_only:true}),row({currency:"KGS"}),
  ])assert.equal(evaluate(billing).can_write,false);
});
test("Odoo source has to be tied to actual original Core owner",()=>{
  assert.equal(evaluate(row(),owner({source_request_id:"foreign"})).can_write,false);
  assert.equal(evaluate(row(),owner({source_namespace:null})).can_write,false);
  assert.equal(evaluate(row(),owner({status:"provisioned"})).can_write,false);
});
test("KG legacy remains outside US SaaS guard",()=>{
  assert.deepEqual(assessUsSaasProjection(null,{marketUs:false,source:null,now:NOW,policy}),
    {managed:false});
});
test("without approved env/commercial policy US is denied, not allowed",()=>{
  assert.equal(readUsSaasProjectionPolicy({}),null);
  assert.equal(evaluate(row(),owner(),{policy:null}).can_write,false);
  const x=readUsSaasProjectionPolicy({
    TOTEM_US_ODOO_SAAS_ACCESS_ENABLED:"true",
    TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON:JSON.stringify({
      approved:true,version:policy.version,
    }),
  });
  assert.equal(x.version,policy.version);
});
test("database resolver prefers real PostgreSQL time and typed owner source",async()=>{
  const calls=[];
  const db={async query(sql,args){
    calls.push(sql);
    if(sql.includes("FROM public.owner_opening_requests"))return {rows:[owner()]};
    if(sql.includes("FROM public.master_salon"))return {rows:[{us:false}]};
    if(sql.includes("FROM public.tenant_market_settings"))return {rows:[{us:true}]};
    if(sql.includes("FROM public.billing_subscriptions"))return {rows:[row()]};
    if(sql.includes("clock_timestamp()"))return {rows:[{now:new Date(NOW)}]};
    throw Error("UNKNOWN_QUERY");}};
  const r=await getUsSaasAccess(db,{ownerType:"salon",ownerId:100,policy});
  assert.equal(r.can_write,true);
  assert.ok(calls.some(x=>x.includes("clock_timestamp()")));
});
test("orphaned Odoo-billing row without source is still US managed and blocked",async()=>{
  const db={async query(sql){
    if(sql.includes("FROM public.owner_opening_requests"))return {rows:[]};
    if(sql.includes("FROM public.tenant_market_settings"))return {rows:[{us:false}]};
    if(sql.includes("FROM public.billing_subscriptions"))return {rows:[row()]};
    if(sql.includes("clock_timestamp()"))return {rows:[{now:new Date(NOW)}]};
    throw Error("UNKNOWN_QUERY");}};
  const r=await getUsSaasAccess(db,{ownerType:"salon",ownerId:100,policy});
  assert.equal(r.managed,true);assert.equal(r.can_write,false);
});
test("two trusted typed source records for same owner always deny",async()=>{
  const db={async query(sql){
    if(sql.includes("FROM public.owner_opening_requests"))return {rows:[owner(),owner({id:12})]};
    throw Error("SHOULD_NOT_LOOKUP_BILLING");}};
  const r=await getUsSaasAccess(db,{ownerType:"salon",ownerId:100,policy});
  assert.equal(r.can_write,false);assert.equal(r.reason,"US_SAAS_DUPLICATE_OWNER_SOURCES");
});
function fakeDb(current=null){
  const sql=[];
  return {sql,async query(stmt,args){
    sql.push(stmt);
    if(stmt.includes("FROM public.billing_subscriptions")&&stmt.includes("FOR UPDATE"))
      return {rows:current?[current]:[]};
    if(stmt.includes("INSERT INTO public.billing_subscriptions"))
      return {rows:[row({provider_subscription_order_id:args[4]})]};
    if(stmt.includes("UPDATE public.billing_subscriptions")&&stmt.includes("subscription_status='active'"))
      return {rows:[row({provider_subscription_order_id:args[4]})]};
    if(stmt.includes("UPDATE public.billing_subscriptions")&&stmt.includes("subscription_status='blocked'"))
      return {rows:[{id:55}]};
    throw Error("UNEXPECTED_SQL");}};
}
test("first paid activation inserts Odoo projection into existing table",async()=>{
  const db=fakeDb();
  const result=await persistUsSaasPaidProjection(db,owner(),evidence(),
    new Date(NOW),assertUsPaidEvidenceForLockedRequest);
  assert.equal(result.provider_namespace,"odoo_online");
  assert.ok(db.sql.some(x=>x.includes("INSERT INTO public.billing_subscriptions")));
});
test("legacy wallet row cannot be overwritten by new Odoo entitlement",async()=>{
  const db=fakeDb({provider_namespace:null,owner_type:"salon",owner_id:100});
  await assert.rejects(()=>persistUsSaasPaidProjection(db,owner(),evidence(),
    new Date(NOW),assertUsPaidEvidenceForLockedRequest),
    /LEGACY_BILLING_TAKEOVER_FORBIDDEN/);
});
test("new paid order without authentic Odoo parent proof is rejected",async()=>{
  const db=fakeDb(row());
  await assert.rejects(()=>persistUsSaasPaidProjection(db,owner(),
    evidence({subscriptionOrderId:1001}),new Date(NOW),
    assertUsPaidEvidenceForLockedRequest),/RENEWAL_LINEAGE_NOT_PROVEN/);
});
test("linked Odoo renewal keeps same Core owner and restores paid projection",async()=>{
  const db=fakeDb(row());
  const x=await persistUsSaasPaidProjection(db,owner(),
    evidence({subscriptionOrderId:1001,renewedFromOrderId:777}),
    new Date(NOW),assertUsPaidEvidenceForLockedRequest);
  assert.equal(x.provider_subscription_order_id,1001);
  assert.ok(db.sql.some(q=>q.includes("UPDATE public.billing_subscriptions")));
  assert.ok(db.sql.every(q=>!q.includes("INSERT INTO public.owner_opening_requests")));
});
test("explicit verified refund blocks existing projection; random failure cannot",async()=>{
  const db=fakeDb(row());
  assert.equal(await revokeUsSaasProjection(db,owner(),{
    reason:"ODOO_INVOICE_REVERSED",verifiedAtUtc:NOW}),true);
  await assert.rejects(()=>revokeUsSaasProjection(db,owner(),{
    reason:"ODOO_READBACK_UNAVAILABLE",verifiedAtUtc:NOW}),/REVOCATION_NOT_PROVEN/);
});
test("internal guard classifies writes/reads, blocks legacy wallet bypass",()=>{
  assert.equal(classifyUsSaasInternalWrite("/salons/s1/services","POST").action,"COMMERCIAL_WRITE");
  assert.equal(classifyUsSaasInternalWrite("/masters/m1/services","DELETE").action,"COMMERCIAL_WRITE");
  assert.equal(classifyUsSaasInternalWrite("/salons/s1/billing/unblock","POST").action,"WALLET_BILLER");
  assert.equal(classifyUsSaasInternalWrite("/masters/m1/subscription/charge","POST").action,"WALLET_BILLER");
  assert.equal(classifyUsSaasInternalWrite("/us-service-prices/salon/s1/20","PUT").action,"COMMERCIAL_WRITE");
  assert.equal(classifyUsSaasInternalWrite("/us-pay-c11/bookings/100/collector","PUT").action,"COMMERCIAL_WRITE");
  assert.equal(classifyUsSaasInternalWrite("/salons/s1/services","GET").action,"READ");
  assert.equal(classifyUsSaasInternalWrite("/auth/login","POST").action,"OUT_OF_SCOPE");
});
test("auth, notifications and renewal support remain accessible without SaaS",async()=>{
  const pool={query:async()=>{throw Error("SHOULD_NOT_BE_CALLED");}};
  const mid=buildUsSaasCommercialGuard(pool);
  let forwarded=0;const next=()=>{forwarded++;};
  for(const [path,method] of [
    ["/auth/login","POST"],["/salons/s1/notifications/1/read","POST"],
    ["/salons/s1/push-subscriptions","POST"],["/salons/s1/services","GET"],
  ])await mid({path,method},{status:()=>({json:()=>{throw Error("DENIED");}})},next);
  assert.equal(forwarded,4);
});
test("expired US account blocked but KG writes pass existing handlers",async()=>{
  const pool={query:async()=>({rows:[{id:100}]})};
  const [blocked,allowed]=[DENY_US(),{managed:false}];
  for(const [access,expected] of [[blocked,403],[allowed,null]]){
    let code=null;let nexted=false;
    const mid=buildUsSaasCommercialGuard(pool,{
      readAccess:async()=>access,getPolicy:()=>policy,
    });
    await mid({path:"/salons/s1/services",method:"POST"},{
      status:n=>{code=n;return {json:()=>{}};}},()=>{nexted=true;});
    assert.equal(code,expected);assert.equal(nexted,expected===null);
  }
});
function DENY_US(){return {managed:true,can_write:false,reason:"US_SAAS_PAID_PERIOD_EXPIRED_OR_NOT_STARTED"};}
test("wallet charge/unblock denied for US even during valid paid period",async()=>{
  const pool={query:async()=>({rows:[{id:100}]})};
  const mid=buildUsSaasCommercialGuard(pool,{
    readAccess:async()=>({managed:true,can_write:true}),getPolicy:()=>policy,
  });
  let result;
  await mid({path:"/salons/s1/billing/unblock",method:"POST"},{
    status:n=>({json:data=>{result={status:n,...data};}})},()=>{throw Error("BYPASS");});
  assert.equal(result.status,409);
  assert.equal(result.error,"US_ODOO_SAAS_LEGACY_WALLET_BILLING_FORBIDDEN");
});
test("production G5 scope excludes old wallet engine and covers public booking",async()=>{
  const internal=await readFile(new URL("../src/routes/internal.js",import.meta.url),"utf8");
  const engine=await readFile(new URL("../src/routes/internal/finance-engine.js",import.meta.url),"utf8");
  const entry=await readFile(new URL("../src/services/entry/entryAccess.js",import.meta.url),"utf8");
  const tenant=await readFile(new URL("../src/middleware/resolveTenant.js",import.meta.url),"utf8");
  const t3=await readFile(new URL("../src/services/provision/ownerOpeningCanonicalActivation.js",import.meta.url),"utf8");
  assert.ok(internal.includes("r.use(buildUsSaasCommercialGuard(pool))"));
  assert.ok(internal.includes("AND provider_namespace IS NULL"));
  assert.ok(engine.includes("AND provider_namespace IS NULL"));
  assert.ok(entry.includes("getUsSaasAccess(db"));
  assert.ok(tenant.includes("getUsSaasAccess(pool"));
  assert.ok(t3.includes("persistUsSaasPaidProjection("));
});

test("policy missing verified freshness cap is denied, not unlimited",()=>{
  const x=evaluate(row(),owner(),{policy:{version:policy.version}});
  assert.equal(x.can_write,false);
  assert.equal(x.reason,"US_SAAS_COMMERCIAL_POLICY_UNAPPROVED");
});
test("percent-encoded owner slug is still subject to paid guard",async()=>{
  const pool={query:async()=>({rows:[{id:100}]})};
  const guard=buildUsSaasCommercialGuard(pool,{
    readAccess:async()=>({managed:true,can_write:false,reason:"EXPIRED"}),
    getPolicy:()=>policy,
  });
  let result=null;
  await guard({path:"/salons/%73alon-1/services",method:"POST"},{
    status:n=>({json:data=>{result={http:n,...data};}})},()=>{
      throw Error("BYPASS_DETECTED");
    });
  assert.equal(result.http,403);
});
test("malformed and overlong business URL cannot bypass commercial guard",async()=>{
  const pool={query:async()=>({rows:[{id:100}]})};
  const guard=buildUsSaasCommercialGuard(pool,{
    readAccess:async()=>({managed:true,can_write:false}),
    getPolicy:()=>policy,
  });
  let result=null;
  await guard({path:"/salons/s1/services/"+"x".repeat(450),method:"POST"},{
    status:n=>({json:d=>{result={n,...d};}})},()=>{throw Error("BYPASS");});
  assert.equal(result.n,414);
});
test("US service-link and manual master booking call same guarded entitlement resolver",async()=>{
  const link=await readFile(new URL("../src/services/usServiceLink.service.js",import.meta.url),"utf8");
  const booking=await readFile(new URL("../src/routes/internalUsMasterManualBooking.js",import.meta.url),"utf8");
  assert.ok(link.includes("getUsSaasAccess(db"));
  assert.ok(booking.includes('ownerType:"master"'));
  assert.ok(booking.includes('ownerType:"salon"'));
  assert.ok(booking.includes("US_SAAS_BOOKING_DISABLED"));
});

function reconciliationPool(existing=row(),{priorRevision="12",lockedRevision=priorRevision}={}){
  const db=fakeDb(existing),base=db.query.bind(db);
  const events=[];
  db.query=async(sql,args)=>{
    if(["BEGIN","COMMIT","ROLLBACK"].includes(sql)){
      events.push(sql);return {rows:[]};
    }
    if(sql.includes("FROM public.owner_opening_requests")&&sql.includes("FOR UPDATE"))
      return {rows:[owner()]};
    if(sql.includes("xmin::text AS projection_revision"))
      return {rows:lockedRevision===null?[]:[{projection_id:"55",projection_revision:lockedRevision}]};
    if(sql.includes("clock_timestamp()"))
      return {rows:[{now:new Date(NOW)}]};
    return base(sql,args);
  };
  return {db,events,
    pool:{query:async(sql)=>sql.includes("xmin::text AS projection_revision")?{rows:priorRevision===null?[]:[{projection_id:"55",projection_revision:priorRevision}]}:{rows:[owner()]},connect:async()=>({
      query:db.query.bind(db),release:()=>{},
    })},
  };
}
test("verified linked renewal restores original Core owner without new registration/email",async()=>{
  const context=reconciliationPool();
  const result=await reconcileUsSaasOpening({
    pool:context.pool,requestId:11,
    readback:async()=>evidence({subscriptionOrderId:1001,renewedFromOrderId:777}),
    writeAudit:async()=>({id:1}),
  });
  assert.equal(result.status,"PAID_VERIFIED");
  assert.equal(result.ownerId,100);
  assert.ok(context.events.includes("COMMIT"));
  assert.ok(context.db.sql.some(x=>x.includes("UPDATE public.billing_subscriptions")));
  assert.equal(context.db.sql.some(x=>x.includes("INSERT INTO public.owner_opening_requests")),false);
});
test("definitive Odoo charge reversal blocks original account, preserves identity",async()=>{
  const context=reconciliationPool();
  const result=await reconcileUsSaasOpening({
    pool:context.pool,requestId:11,
    readback:async()=>({status:"WAIT",reason:"ODOO_INVOICE_REVERSED"}),
    writeAudit:async()=>({id:2}),
  });
  assert.equal(result.status,"REVOKED");
  assert.ok(context.db.sql.some(x=>x.includes("subscription_status='blocked'")));
});
test("Odoo provider outage does not forge a payment or revoke old owner row",async()=>{
  const context=reconciliationPool();
  const result=await reconcileUsSaasOpening({
    pool:context.pool,requestId:11,
    readback:async()=>{throw Error("NETWORK_DOWN");},
    writeAudit:async()=>({id:1}),
  });
  assert.equal(result.status,"WAIT");
  assert.equal(context.events.length,0);
});
test("reconcile is a protected Admin operation, with default commercial HOLD",async()=>{
  const body=await readFile(new URL("../src/routes/internal/adminOpenOwner.js",import.meta.url),"utf8");
  assert.ok(body.includes('r.post("/requests/:id/billing-reconcile"'));
  assert.ok(body.includes('process.env.TOTEM_US_ODOO_SAAS_ACCESS_ENABLED!=="true"'));
  assert.ok(body.includes("reconcileUsSaasOpening({"));
});

// PostgreSQL must infer a type for every supplied positional bind parameter.
test("paid projection UPDATE binds every parameter and reasserts the exact provider source",async()=>{
 const calls=[];
 const db={async query(sql,args){
  if(sql.includes("SELECT * FROM public.billing_subscriptions"))return {rows:[row()]};
  calls.push({sql,args});return {rows:[row()]};
 }};
 await persistUsSaasPaidProjection(db,owner(),evidence(),new Date(NOW),assertUsPaidEvidenceForLockedRequest);
 assert.equal(calls.length,1);
 const {sql,args}=calls[0];
 const used=new Set([...sql.matchAll(/\$(\d+)/g)].map(m=>Number(m[1])));
 assert.deepEqual([...used].sort((a,b)=>a-b),Array.from({length:args.length},(_,i)=>i+1));
 assert.match(sql,/provider_partner_id=\$3 AND provider_source_request_id=\$4/);
});

for(const [name,result] of [["paid",evidence()],["revocation",{status:"WAIT",reason:"ODOO_INVOICE_REVERSED"}]]){
 test("concurrent projection update invalidates older "+name+" readback",async()=>{
  const c=reconciliationPool(row(),{priorRevision:"12",lockedRevision:"13"});
  let audit=0;
  const out=await reconcileUsSaasOpening({pool:c.pool,requestId:11,readback:async()=>result,writeAudit:async()=>{audit++;}});
  assert.equal(out.reason,"US_SAAS_RECONCILIATION_PROJECTION_CHANGED");
  assert.deepEqual(c.events,["BEGIN","ROLLBACK"]);
  assert.equal(audit,0);
  assert.equal(c.db.sql.some(x=>x.includes("UPDATE public.billing_subscriptions")),false);
 });
}
test("reconciliation never provisions a missing billing row",async()=>{
 const c=reconciliationPool(row(),{priorRevision:null});let reads=0;
 const out=await reconcileUsSaasOpening({pool:c.pool,requestId:11,readback:async()=>{reads++;return evidence();},writeAudit:async()=>{}});
 assert.equal(out.reason,"US_SAAS_EXISTING_PROJECTION_REQUIRED");
 assert.equal(reads,0);assert.deepEqual(c.events,[]);
});
