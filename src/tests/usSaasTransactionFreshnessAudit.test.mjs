import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const src=f=>readFileSync(new URL("../"+f,import.meta.url),"utf8");
const timestamp="2026-11-15T00:00:00.000Z";
const late="2026-11-15T00:00:10.001Z";
const req={id:1,owner_type:"salon",created_owner_id:2,created_auth_user_id:3,source_namespace:"odoo_online",source_company_id:4,source_website_id:5,source_partner_id:7,source_request_id:"odoo-us-partner-7",status:"activated",precheck_result_json:{normalized:{market_code:"US"},odoo_source_proof:{entry_mode:"salon"}}};
const row={id:9,owner_type:"salon",owner_id:2,provider_namespace:"odoo_online",wallet_only:false,currency:"USD",billing_model:"subscription",provider_company_id:4,provider_website_id:5,provider_partner_id:7,provider_source_request_id:req.source_request_id,subscription_status:"active",blocked_at:null,provider_revoked_at:null,provider_subscription_order_id:11,provider_invoice_id:12,provider_policy_version:"fixture",current_period_start:"2026-10-01T00:00:00Z",current_period_end:"2026-11-01T00:00:00Z",provider_verified_at:"2026-10-15T00:00:00Z"};
const ev=Object.freeze({status:"PAID_VERIFIED",canActivate:true,requestId:1,createdOwnerId:2,createdAuthUserId:3,ownerType:"salon",companyId:4,websiteId:5,partnerId:7,sourceRequestId:req.source_request_id,subscriptionOrderId:11,invoiceId:13,commercialPolicyVersion:"fixture",periodStartUtc:"2026-11-01T00:00:00Z",periodEndExclusiveUtc:"2026-12-01T00:00:00Z",verifiedAtUtc:timestamp});
const env={TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED:"true",TOTEM_US_ODOO_SAAS_ACCESS_ENABLED:"true",TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON:JSON.stringify({version:"fixture",coveredOwnerTypes:["salon"]})};
const admin={id:8},sourceAdmin={role:"admin",user_id:8,session_id:"00000000-0000-0000-0000-000000000001"};
async function graph({queueAudit={id:17}}={}){
 const context=vm.createContext({});
 const synth=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v)},{context});
 const fence=synth({assertUsCommercialWriterReleased:()=>{}}); // test-only graph, no release change
 const projection=new vm.SourceTextModule(src("services/billing/usSaasEntitlementProjection.js"),{context});
 const activation=new vm.SourceTextModule(src("services/provision/ownerOpeningCanonicalActivation.js"),{context});
 const recon=new vm.SourceTextModule(src("services/billing/usSaasReconciliation.js"),{context});
 const g3=synth({assertManualG3RequestReceipt:()=>true,isScopedUsOdooRequest:()=>true});
 const kg=synth({kgSharedMasterProof:()=>false,assertKgSharedMasterActivation:()=>{throw Error("unexpected KG")}});
 const own=synth({isUsOwnSalonMaster:()=>false,assertUsOwnSalonActivationReady:()=>{throw Error("unexpected shared role")}});
 const deps={"./usCommercialWriterRelease.js":fence,"../provision/usCommercialWriterRelease.js":fence,
 "./usSaasAuthorityReadOnly.js":synth({readUsSaasProjectionPolicy:()=>null}),
 "../billing/usSaasEntitlementProjection.js":projection,"./usSaasEntitlementProjection.js":projection,
 "./usG3ManualRequestReceipt.js":g3,"./kgSharedMasterIdentity.js":kg,"./usOwnSalonCanonicalActivation.js":own,
 "../provision/usPaidOwnerOpeningGate.js":synth({prepareUsPaidActivationEvidence:async()=>ev}),
 "../provision/ownerOpeningCanonicalActivation.js":activation,"../provision/usOdooG3SealProof.js":synth({validG3Seal:()=>true}),
 "./usOdooReadOnlyClient.js":synth({createUsOdooReadOnlyClient:()=>{throw Error("network prohibited")}}),
 "./usOdooPaidEntitlement.js":synth({isUsOdooServicePeriodPolicy:()=>true}),
 "./usSaasReconciliationAudit.js":synth({US_SAAS_SYSTEM_ACTOR:{actor:"system:qa"},writeSystemUsSaasReconciliationAudit:async()=>queueAudit})};
 await recon.link(spec=>{assert.ok(deps[spec],spec);return deps[spec]});await recon.evaluate();
 return {projection:projection.namespace,activation:activation.namespace,recon:recon.namespace};
}
function mock({mode="reconcile",clocks=[timestamp,timestamp,timestamp]}={}){
 const request={...req,status:mode==="activation"?"provisioned":"activated"};
 const log=[];let clockIndex=0,mutations=0,commits=0,rollbacks=0,releases=0;
 const db={async query(sql,args){
  log.push(sql);
  if(sql==="BEGIN"||sql.startsWith("SET LOCAL"))return {rows:[]};
  if(sql==="COMMIT"){commits++;return {rows:[]}}
  if(sql==="ROLLBACK"){rollbacks++;mutations=0;return {rows:[]}}
  if(sql.includes("clock_timestamp() AS now")){assert.ok(clockIndex<clocks.length,"unexpected clock");const v=clocks[clockIndex++];return {rows:v===undefined?[]:[{now:v}]}}
  if(sql.includes("auth_sessions"))return {rows:[{id:"session"}]};
  if(sql.startsWith("SELECT * FROM public.owner_opening_requests"))return {rows:[request]};
  if(sql.startsWith("SELECT * FROM public.billing_subscriptions"))return {rows:mode==="activation"?[]:[row]};
  if(sql.startsWith("UPDATE public.billing_subscriptions")||sql.startsWith("INSERT INTO public.billing_subscriptions")){mutations++;return {rows:[{...row,provider_invoice_id:13}]}}
  if(sql.startsWith("UPDATE public.auth_users")){mutations++;return {rows:[{id:3}]}}
  if(sql.startsWith("UPDATE public.owner_opening_requests")){mutations++;return {rows:[{...request,status:"activated"}]}}
  throw Error("unexpected SQL "+sql)
 },release(){releases++}};
 const pool={query:db.query.bind(db),connect:async()=>db};
 return {db,pool,log,request,summary:()=>({clockIndex,mutations,commits,rollbacks,releases})};
}
const opts=(m,audit)=>({pool:m.pool,requestId:1,sourceAdmin,operator:admin,env,writeAudit:async()=>audit});
const actOpts=(m,audit)=>({pool:m.pool,requestId:1,admin,paidEvidence:ev,sourceReceipt:{},sourceAdmin,requireUsScope:true,getMarketCode:()=>"US",assertMarketPolicy:()=>{},assertUsActivationReady:async()=>{},activateEntity:async()=>({salon:{id:2}}),writeAudit:async()=>audit});
const isCode=c=>e=>e?.code===c;
function rolledBack(m){const s=m.summary();assert.equal(s.commits,0);assert.equal(s.rollbacks,1);assert.equal(s.mutations,0);assert.equal(s.releases,1)}
test("post-lock clock rejects aged proof without executing writer SQL",async()=>{
 const g=await graph(),m=mock({clocks:[late]});
 await assert.rejects(g.projection.persistUsSaasPaidProjection(m.db,req,ev,timestamp,g.activation.assertUsPaidEvidenceForLockedRequest,{operation:"RECONCILE"}),isCode("US_ODOO_PAID_ENTITLEMENT_STALE_OR_EXPIRED"));
 assert.match(m.log[0],/FOR UPDATE/);assert.match(m.log[1],/clock_timestamp/);assert.equal(m.summary().mutations,0);
});
test("missing or invalid PostgreSQL clock fails closed",async()=>{
 const g=await graph();
 for(const bad of [undefined,null,"invalid",false,123]){
  const m=mock({clocks:[bad]});
  await assert.rejects(g.projection.persistUsSaasPaidProjection(m.db,req,ev,timestamp,g.activation.assertUsPaidEvidenceForLockedRequest,{operation:"RECONCILE"}),isCode("US_SAAS_TRANSACTION_CLOCK_INVALID"));assert.equal(m.summary().mutations,0);
 }
});
test("manual reconciliation rolls back for missing, invalid or unsafe audit receipt",async()=>{
 const g=await graph();
 for(const bad of [null,{}, {id:null},{id:0},{id:-1},{id:1.5},{id:true},{id:"1e2"},{id:"9007199254740992"}]){
  const m=mock();await assert.rejects(g.recon.reconcileUsSaasOpening(opts(m,bad)),isCode("US_SAAS_RECONCILIATION_AUDIT_REQUIRED"));rolledBack(m);assert.ok(m.log.some(x=>x.startsWith("UPDATE public.billing_subscriptions")));
 }
});
test("manual reconciliation final clock after audit rejects stale proof and rolls back",async()=>{
 const g=await graph(),m=mock({clocks:[timestamp,timestamp,late]});
 await assert.rejects(g.recon.reconcileUsSaasOpening(opts(m,{id:17})),isCode("US_ODOO_PAID_ENTITLEMENT_STALE_OR_EXPIRED"));rolledBack(m);
 assert.equal(m.summary().clockIndex,3);
});
test("manual reconciliation valid audit and final proof commit exactly once",async()=>{
 const g=await graph(),m=mock();
 const out=await g.recon.reconcileUsSaasOpening(opts(m,{id:"17"}));
 assert.equal(out.audit_event_id,17);assert.equal(m.summary().commits,1);assert.equal(m.summary().mutations,1);
 assert.equal(m.log.at(-2),"SELECT clock_timestamp() AS now");assert.equal(m.log.at(-1),"COMMIT");
});
test("queue reconciliation checks fresh clock after final lease and rolls back",async()=>{
 const g=await graph(),m=mock({clocks:[timestamp,timestamp,late]});let leases=0;
 await assert.rejects(g.recon.reconcileUsSaasOpeningFromQueue({pool:m.pool,requestId:1,env,signal:{aborted:false},createClient:()=>{throw Error("network prohibited")},assertLease:async()=>{leases++}}),isCode("US_ODOO_PAID_ENTITLEMENT_STALE_OR_EXPIRED"));
 assert.equal(leases,2);rolledBack(m);
});
test("initial activation rejects post-readiness expired evidence before insert",async()=>{
 const g=await graph(),m=mock({mode:"activation",clocks:[timestamp,late]});
 await assert.rejects(g.activation.activateOwnerOpeningCanonical(actOpts(m,{id:17})),isCode("US_ODOO_PAID_ENTITLEMENT_STALE_OR_EXPIRED"));rolledBack(m);assert.ok(!m.log.some(x=>x.startsWith("INSERT INTO public.billing_subscriptions")));
});
test("initial activation invalid audit and final stale receipt each roll back",async()=>{
 const g=await graph();
 for(const [audit,clocks,expected] of [[{id:true},[timestamp,timestamp],"US_ACTIVATION_AUDIT_REQUIRED"],[{id:17},[timestamp,timestamp,late],"US_ODOO_PAID_ENTITLEMENT_STALE_OR_EXPIRED"]]){
  const m=mock({mode:"activation",clocks});await assert.rejects(g.activation.activateOwnerOpeningCanonical(actOpts(m,audit)),isCode(expected));rolledBack(m);
  assert.ok(m.log.some(x=>x.startsWith("INSERT INTO public.billing_subscriptions")));
 }
});
test("initial activation fresh proof and positive audit commit exactly once",async()=>{
 const g=await graph(),m=mock({mode:"activation"});
 const out=await g.activation.activateOwnerOpeningCanonical(actOpts(m,{id:"17"}));assert.equal(out.audit_event_id,17);assert.equal(m.summary().commits,1);
 assert.equal(m.log.at(-2),"SELECT clock_timestamp() AS now");
});
