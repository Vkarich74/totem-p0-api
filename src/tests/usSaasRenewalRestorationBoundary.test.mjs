import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const projection=readFileSync(new URL("../services/billing/usSaasEntitlementProjection.js",import.meta.url),"utf8");
const fenceSource=readFileSync(new URL("../services/provision/usCommercialWriterRelease.js",import.meta.url),"utf8");
const reconciliation=readFileSync(new URL("../services/billing/usSaasReconciliation.js",import.meta.url),"utf8");
const activation=readFileSync(new URL("../services/provision/ownerOpeningCanonicalActivation.js",import.meta.url),"utf8");
// Synthetic in-memory module graph only. No pool, network, env, real user or
// production writer release. The actual fence is also tested independently.
async function moduleWithFence(released=false){
 const context=vm.createContext({});
 const fence=new vm.SourceTextModule(fenceSource,{context});
 await fence.link(()=>{throw Error("unexpected fence import");});await fence.evaluate();
 const deps={
  "../provision/usCommercialWriterRelease.js":new vm.SyntheticModule(["assertUsCommercialWriterReleased"],function(){
   this.setExport("assertUsCommercialWriterReleased",released?()=>{}:fence.namespace.assertUsCommercialWriterReleased);
  },{context}),
  "./usSaasAuthorityReadOnly.js":new vm.SyntheticModule(["readUsSaasProjectionPolicy"],function(){
   this.setExport("readUsSaasProjectionPolicy",()=>null);
  },{context})
 };
 const mod=new vm.SourceTextModule(projection,{context});
 await mod.link(name=>{assert.ok(deps[name]);return deps[name]});await mod.evaluate();
 return mod.namespace;
}
const req={id:1,owner_type:"salon",created_owner_id:2,created_auth_user_id:3,source_namespace:"odoo_online",source_company_id:4,source_website_id:5,source_partner_id:7,source_request_id:"odoo-us-partner-7",status:"activated"};
const row={id:9,owner_type:"salon",owner_id:2,provider_namespace:"odoo_online",wallet_only:false,currency:"USD",billing_model:"subscription",provider_company_id:4,provider_website_id:5,provider_partner_id:7,provider_source_request_id:req.source_request_id,subscription_status:"active",blocked_at:null,provider_revoked_at:null,provider_subscription_order_id:11,provider_invoice_id:12,provider_policy_version:"fixture",current_period_start:"2026-10-01T00:00:00Z",current_period_end:"2026-11-01T00:00:00Z",provider_verified_at:"2026-10-15T00:00:00Z"};
const now="2026-11-15T00:00:00Z";
const next={subscriptionOrderId:11,invoiceId:13,commercialPolicyVersion:"fixture",periodStartUtc:"2026-11-01T00:00:00Z",periodEndExclusiveUtc:"2026-12-01T00:00:00Z",verifiedAtUtc:now};
const refresh={...next,invoiceId:12,periodStartUtc:row.current_period_start,periodEndExclusiveUtc:row.current_period_end,verifiedAtUtc:"2026-10-20T00:00:00Z"};
const code=(e,c)=>e?.code===c;
test("actual commercial fence denies before any query",async()=>{
 const m=await moduleWithFence();let calls=0;
 const db={query(){calls++;throw Error("unexpected SQL")}};
 await assert.rejects(m.persistUsSaasPaidProjection(db,req,next,now,()=>{}, {operation:"RECONCILE"}),e=>code(e,"US_SAAS_PROJECTION_RELEASE_HOLD"));
 await assert.rejects(m.revokeUsSaasProjection(db,req,{}),e=>code(e,"US_SAAS_PROJECTION_RELEASE_HOLD"));
 assert.equal(calls,0);
});
test("transition decisions and boundary rejection",async()=>{
 const m=await moduleWithFence();
 const f=m.assertUsSaasPaidProjectionTransition;
 assert.equal(f(row,req,next,now,"RECONCILE"),"RENEWAL");
 assert.equal(f(row,req,refresh,refresh.verifiedAtUtc,"RECONCILE"),"REFRESH");
 assert.equal(f(null,{...req,status:"provisioned"},next,now,"INITIAL_ACTIVATION"),"INITIAL_ACTIVATION");
 const cases=[
  [row,req,next,now,"RESTORE","US_SAAS_RESTORATION_AUTHORITY_HOLD"],
  [{...row,blocked_at:now},req,next,now,"RECONCILE","US_SAAS_RESTORATION_AUTHORITY_HOLD"],
  [{...row,provider_revoked_at:now},req,next,now,"RECONCILE","US_SAAS_RESTORATION_AUTHORITY_HOLD"],
  [{...row,subscription_status:"blocked"},req,next,now,"RECONCILE","US_SAAS_RESTORATION_AUTHORITY_HOLD"],
  [{...row,blocked_at:undefined},req,next,now,"RECONCILE","US_SAAS_RESTORATION_AUTHORITY_HOLD"],
  [null,req,next,now,"RECONCILE","US_SAAS_EXISTING_PROJECTION_REQUIRED"],
  [row,{...req,status:"provisioned"},next,now,"INITIAL_ACTIVATION","US_SAAS_INITIAL_PROJECTION_ALREADY_EXISTS"],
  [null,req,next,now,"INITIAL_ACTIVATION","US_SAAS_INITIAL_ACTIVATION_STATE_INVALID"],
  [row,req,{...next,subscriptionOrderId:14,renewedFromOrderId:11},now,"RECONCILE","US_SAAS_RENEWAL_LINEAGE_NOT_PROVEN"],
  [row,req,{...next,invoiceId:12},now,"RECONCILE","US_SAAS_RENEWAL_CYCLE_NOT_PROVEN"],
  [row,req,{...next,periodStartUtc:"2026-11-02T00:00:00Z"},now,"RECONCILE","US_SAAS_RENEWAL_CYCLE_NOT_PROVEN"],
  [row,req,{...next,periodStartUtc:"2026-10-31T00:00:00Z"},now,"RECONCILE","US_SAAS_RENEWAL_CYCLE_NOT_PROVEN"],
  [row,req,{...next,commercialPolicyVersion:"other"},now,"RECONCILE","US_SAAS_RENEWAL_POLICY_CHANGED"],
  [{...row,provider_verified_at:now},req,next,now,"RECONCILE","US_SAAS_RECONCILIATION_EVIDENCE_STALE"],
  [{...row,provider_verified_at:null},req,next,now,"RECONCILE","US_SAAS_RECONCILIATION_EVIDENCE_STALE"],
  [row,req,{...next,verifiedAtUtc:"2026-11-14T23:59:49Z"},now,"RECONCILE","US_SAAS_PROJECTION_EVIDENCE_INVALID"],
  [row,req,{...next,verifiedAtUtc:"2026-11-15T00:00:02Z"},now,"RECONCILE","US_SAAS_PROJECTION_EVIDENCE_INVALID"],
  [row,req,{...next,periodStartUtc:"2026-11-16T00:00:00Z"},now,"RECONCILE","US_SAAS_PROJECTION_EVIDENCE_INVALID"],
  [row,req,next,"2026-12-01T00:00:00Z","RECONCILE","US_SAAS_PROJECTION_EVIDENCE_INVALID"],
  [{...row,provider_company_id:2},req,next,now,"RECONCILE","US_SAAS_EXISTING_PROJECTION_SOURCE_CHANGED"],
  [row,{...req,owner_type:"master"},next,now,"RECONCILE","US_SAAS_PROJECTION_SCOPE_INVALID"],
  [row,req,next,now,undefined,"US_SAAS_PROJECTION_OPERATION_REQUIRED"],
  [row,req,{...refresh,invoiceId:99},refresh.verifiedAtUtc,"RECONCILE","US_SAAS_RENEWAL_CYCLE_NOT_PROVEN"]
 ];
 for(const [r,q,e,t,op,expected] of cases)assert.throws(()=>f(r,q,e,t,op),x=>code(x,expected),expected);
});
test("synthetic SQL: reconcile updates exact existing row, never clears blocks",async()=>{
 const m=await moduleWithFence(true);const calls=[];
 const db={async query(sql,args){calls.push({sql,args});return sql.includes("clock_timestamp")?{rows:[{now}]}:calls.length===1?{rows:[row]}:{rows:[{...row,provider_invoice_id:13}]}}};
 const out=await m.persistUsSaasPaidProjection(db,req,next,now,()=>{}, {operation:"RECONCILE"});
 assert.equal(out.id,9);assert.equal(calls.length,3);
 assert.match(calls[0].sql,/FOR UPDATE/);
 assert.match(calls[2].sql,/UPDATE public.billing_subscriptions/);
 assert.match(calls[2].sql,/WHERE id=\$11/);
 assert.match(calls[2].sql,/blocked_at IS NULL AND provider_revoked_at IS NULL/);
 assert.doesNotMatch(calls[2].sql,/blocked_at\s*=|provider_revoked_at\s*=|subscription_status\s*=\s*'active',/);
 assert.equal(calls[2].args[10],9);
});
test("synthetic SQL: blocked/missing/duplicate/race never grants or inserts",async()=>{
 const m=await moduleWithFence(true);
 for(const [rows,expected] of [[[{...row,blocked_at:now}],"US_SAAS_RESTORATION_AUTHORITY_HOLD"],[[],"US_SAAS_EXISTING_PROJECTION_REQUIRED"],[[row,row],"US_SAAS_DUPLICATE_PROJECTIONS"]]){
  let calls=0;const db={async query(sql){calls++;return sql.includes("clock_timestamp")?{rows:[{now}]}:{rows}}};
  await assert.rejects(m.persistUsSaasPaidProjection(db,req,next,now,()=>{}, {operation:"RECONCILE"}),e=>code(e,expected));assert.equal(calls,rows.length>1?1:2);
 }
 let calls=0;const db={async query(sql){calls++;return sql.includes("clock_timestamp")?{rows:[{now}]}:{rows:calls===1?[row]:[]}}};
 await assert.rejects(m.persistUsSaasPaidProjection(db,req,next,now,()=>{}, {operation:"RECONCILE"}),e=>code(e,"US_SAAS_PROJECTION_UPDATE_RACE"));
 assert.equal(calls,3);
});
test("synthetic SQL: initial activation only inserts and cannot take over existing projection",async()=>{
 const m=await moduleWithFence(true);const calls=[];const q={...req,status:"provisioned"};
 const db={async query(sql,args){calls.push(sql);return sql.includes("clock_timestamp")?{rows:[{now}]}:{rows:calls.length===1?[]:[{id:9}]}}};
 assert.equal((await m.persistUsSaasPaidProjection(db,q,next,now,()=>{}, {operation:"INITIAL_ACTIVATION"})).id,9);
 assert.match(calls[2],/INSERT INTO public.billing_subscriptions/);
 let n=0;await assert.rejects(m.persistUsSaasPaidProjection({async query(sql){n++;return sql.includes("clock_timestamp")?{rows:[{now}]}:{rows:[row]}}},q,next,now,()=>{}, {operation:"INITIAL_ACTIVATION"}),e=>code(e,"US_SAAS_INITIAL_PROJECTION_ALREADY_EXISTS"));assert.equal(n,2);
});
test("negative mutation and restore remain held even in synthetic released graph",async()=>{
 const m=await moduleWithFence(true);let calls=0;
 const db={query(){calls++;throw Error("unexpected SQL")}};
 await assert.rejects(m.revokeUsSaasProjection(db,req,{reason:"ODOO_INVOICE_REVERSED",verifiedAtUtc:now}),e=>code(e,"US_SAAS_REVOCATION_POLICY_HOLD"));
 await assert.rejects(m.persistUsSaasPaidProjection(db,req,next,now,()=>{}, {operation:"RESTORE"}),e=>code(e,"US_SAAS_RESTORATION_AUTHORITY_HOLD"));
 assert.equal(calls,0);
});
test("all real writer call sites explicitly separate activation and reconciliation",()=>{
 assert.match(activation,/assertUsPaidEvidenceForLockedRequest,\s*\{operation:"INITIAL_ACTIVATION"\}/);
 assert.match(reconciliation,/assertUsPaidEvidenceForLockedRequest,\s*\{operation:"RECONCILE"\}/);
 assert.doesNotMatch(reconciliation,/revokeUsSaasProjection\(/);
 assert.match(reconciliation,/US_SAAS_NEGATIVE_DISPOSITION_HOLD/);
 assert.match(reconciliation,/US_SAAS_RESTORATION_AUTHORITY_HOLD/);
});
