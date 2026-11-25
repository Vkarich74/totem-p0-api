// C6 exact held package: real disposable PostgreSQL 17.
// Only synthetic fixture identities; no Production URLs, data or providers.
import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import vm from "node:vm";
import pg from "pg";
import {getUsSaasAccess} from "../src/services/billing/usSaasEntitlementProjection.js";
import {assertLegacyWalletSubscriptionAuthority} from "../src/services/billing/usSaasWalletBoundary.js";
import {assertProfileWriteScope,assertLegacySalonHoursScope,assertUsHoursWriteScope} from "../src/services/billing/usSaasProfileHoursGuard.js";
import {assertUsBookingAuthority,assertUsManualBookingSession} from "../src/services/billing/usSaasBookingGuard.js";
import {saveUsOwnerServiceTax,readUsOwnerServiceTax} from "../src/services/usServiceTaxSettings.service.js";
import {saveUsOwnerServicePrice} from "../src/services/usServicePrice.service.js";
import {saveUsServiceLink} from "../src/services/usServiceLink.service.js";
import * as activationActual from "../src/services/provision/ownerOpeningCanonicalActivation.js";
import * as welcomeActual from "../src/services/notifications/ownerOpeningWelcomeIntent.js";
import * as reconcileActual from "../src/services/billing/usSaasReconciliation.js";
import * as receiptActual from "../src/services/provision/usG3ManualRequestReceipt.js";
import * as kgActual from "../src/services/provision/kgSharedMasterIdentity.js";
import * as ownActual from "../src/services/provision/usOwnSalonCanonicalActivation.js";
import {commercialWriterRelease} from "../src/services/provision/usCommercialWriterRelease.js";
const raw=process.env.G5_TEST_DATABASE_URL;
if(!raw||process.env.DATABASE_URL||process.env.C6_ISOLATED!=="YES")throw Error("C6_ISOLATED_DATABASE_REQUIRED");
const url=new URL(raw);
if(url.hostname!=="127.0.0.1"||url.port!=="55432"||url.pathname!=="/c6_held_test")throw Error("C6_REFUSES_NONLOCAL_DATABASE");
const pool=new pg.Pool({connectionString:raw,max:16,connectionTimeoutMillis:3000,statement_timeout:10000});
const q=(sql,args)=>pool.query(sql,args);
const scalar=async(sql,args)=>Number((await q(sql,args)).rows[0].n);
const deny=(code)=>e=>e?.code===code;
const uuid=n=>"11111111-1111-4111-8111-"+String(n).padStart(12,"0");
const auth=(role,id)=>({role,user_id:id,session_id:uuid(id),source:"session"});
const salonReq={auth:auth("salon_admin",11),identity:{user_id:11},params:{slug:"ci-us"}};
const masterReq={auth:auth("master",12),identity:{user_id:12},params:{slug:"ci-master"}};
const sourceAdmin=auth("admin",14);
const opts={ownerType:"salon",ownerSlug:"ci-us",auth:salonReq.auth,identity:salonReq.identity};
const booking={salonId:101,masterId:301,serviceLinkId:501,marketContext:{market_code:"US",country_code:"US",currency_code:"USD",market_id:2},location:{id:401,location_code:"primary",timezone:"America/Los_Angeles"}};
const forbidden=()=>{throw Error("UNEXPECTED_EXTERNAL_IO")};
let projection,activation,welcome,reconciliation,mode="paid",providerReads=0;
const receipt=(id,purpose)=>Object.freeze({id:Number(id),purpose,adminId:14});
function evidence(r,{periodDays=30,invoice=801,order=701}={}){
 const now=Date.now();
 return {status:"PAID_VERIFIED",canActivate:true,requestId:Number(r.id),createdOwnerId:Number(r.created_owner_id),createdAuthUserId:Number(r.created_auth_user_id),sourceRequestId:r.source_request_id,ownerType:r.owner_type,partnerId:Number(r.source_partner_id),companyId:4,websiteId:5,verifiedAtUtc:new Date(now).toISOString(),periodStartUtc:new Date(now-86400000).toISOString(),periodEndExclusiveUtc:new Date(now+periodDays*86400000).toISOString(),subscriptionOrderId:order,invoiceId:invoice,commercialPolicyVersion:"ci-v1"};
}
async function isolatedGraph(){
 // Test-only VM linker substitutes the hard fence and trusted external proof.
 // Exact business modules are read unchanged; the actual fence is tested separately.
 const context=vm.createContext({console,Date,process:{env:{}}});
 const sm=async o=>{const m=new vm.SyntheticModule(Object.keys(o),function(){for(const [k,v] of Object.entries(o))this.setExport(k,v)},{context});await m.link(()=>{});await m.evaluate();return m;};
 const src=async path=>new vm.SourceTextModule(await readFile(new URL("../"+path,import.meta.url),"utf8"),{context,identifier:path});
 const fence=await sm({assertUsCommercialWriterReleased:()=>{}});
 const receiptMock=await sm({isScopedUsOdooRequest:receiptActual.isScopedUsOdooRequest,assertManualG3RequestReceipt:(r,p,o)=>!!p&&p.id===Number(r.id)&&p.purpose===o.purpose&&p.adminId===Number(o.admin?.user_id)});
 const kg=await sm({kgSharedMasterProof:kgActual.kgSharedMasterProof,assertKgSharedMasterActivation:kgActual.assertKgSharedMasterActivation});
 const own=await sm({isUsOwnSalonMaster:ownActual.isUsOwnSalonMaster,assertUsOwnSalonActivationReady:forbidden});
 const p=await src("src/services/billing/usSaasEntitlementProjection.js");
 await p.link(()=>fence);await p.evaluate();projection=p.namespace;
 const a=await src("src/services/provision/ownerOpeningCanonicalActivation.js");
 await a.link(s=>s.endsWith("usCommercialWriterRelease.js")?fence:s.endsWith("usG3ManualRequestReceipt.js")?receiptMock:s.endsWith("kgSharedMasterIdentity.js")?kg:s.endsWith("usOwnSalonCanonicalActivation.js")?own:p);await a.evaluate();activation=a.namespace;
 const w=await src("src/services/notifications/ownerOpeningWelcomeIntent.js");
 await w.link(s=>s.endsWith("usCommercialWriterRelease.js")?fence:s.endsWith("usG3ManualRequestReceipt.js")?receiptMock:a);await w.evaluate();welcome=w.namespace;
 const gate=await sm({prepareUsPaidActivationEvidence:async r=>mode==="paid"?evidence(r,{periodDays:45,invoice:802}):{status:"WAIT",reason:"ODOO_READBACK_UNAVAILABLE"}});
 const seal=await sm({validG3Seal:()=>true});
 const client=await sm({createUsOdooReadOnlyClient:()=>({searchRead:async(model,domain)=>{
 providerReads++;if(model!=="sale.order")throw Error("UNEXPECTED_PROVIDER_MODEL");
 assert.equal(domain[0][2],701);
 return [{id:701,company_id:[4],website_id:[5],partner_id:[203],state:mode==="cancel"?"cancel":"sale",is_subscription:true,plan_id:[6],currency_id:[2],invoice_ids:[802]}];
 }})});
 const sysAudit=await src("src/services/billing/usSaasReconciliationAudit.js");
 await sysAudit.link(()=>{throw Error("UNEXPECTED_SYSTEM_AUDIT_IMPORT")});await sysAudit.evaluate();
 const r=await src("src/services/billing/usSaasReconciliation.js");
 await r.link(s=>s.endsWith("usCommercialWriterRelease.js")?fence:s.endsWith("usPaidOwnerOpeningGate.js")?gate:s.endsWith("ownerOpeningCanonicalActivation.js")?a:s.endsWith("usOdooG3SealProof.js")?seal:s.endsWith("usOdooReadOnlyClient.js")?client:s.endsWith("usSaasReconciliationAudit.js")?sysAudit:p);await r.evaluate();reconciliation=r.namespace;
}
before(async()=>{
 const info=(await q("SELECT current_database() AS name,current_setting('server_version_num')::int AS version")).rows[0];
 assert.equal(info.name,"c6_held_test");assert.equal(Math.floor(info.version/10000),17);
 assert.equal(await scalar("SELECT count(*) AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='billing_subscriptions'"),29);
 assert.equal(await scalar("SELECT count(*) AS n FROM public.billing_subscriptions"),0);
 await q("INSERT INTO public.markets(id,code,country_code,default_locale,supported_locales,default_currency,supported_currencies,default_timezone,country_pack_code,country_pack_version,active) VALUES(1,'KG','KG','ru-KG',ARRAY['ru-KG'],'KGS',ARRAY['KGS'],'Asia/Bishkek','KG','1',true),(2,'US','US','en-US',ARRAY['en-US'],'USD',ARRAY['USD'],'America/Los_Angeles','US','1',true)");
 await q("INSERT INTO public.salons(id,slug,name,enabled,status) VALUES(101,'ci-us','CI US',true,'active'),(102,'ci-kg','CI KG',true,'active'),(103,'ci-opening','CI Opening',false,'active'),(104,'ci-rollback','CI Rollback',false,'active')");
 await q("INSERT INTO public.auth_users(id,email,role,salon_slug,master_slug,enabled,must_set_password) VALUES(11,'salon@example.invalid','salon_admin','ci-us',NULL,true,false),(12,'master@example.invalid','master',NULL,'ci-master',true,true),(13,'kg@example.invalid','salon_admin','ci-kg',NULL,true,false),(14,'admin@example.invalid','admin',NULL,NULL,true,false),(15,'opening@example.invalid','salon_admin','ci-opening',NULL,false,false),(16,'rollback@example.invalid','salon_admin','ci-rollback',NULL,false,false)");
 for(const i of [11,12,13,14])await q("INSERT INTO public.auth_sessions(id,user_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')",[uuid(i),i]);
 await q("INSERT INTO public.owner_salon(id,owner_id,salon_id,status) VALUES(1,'11',101,'active'),(2,'13',102,'active')");
 await q("INSERT INTO public.masters(id,slug,name,user_id) VALUES(301,'ci-master','CI Master',12)");
 await q("INSERT INTO public.master_salon(id,master_id,salon_id,status) VALUES(1,301,101,'active')");
 await q("INSERT INTO public.tenant_market_settings(salon_id,market_id) VALUES(101,2),(102,1),(103,2),(104,2)");
 await q("INSERT INTO public.us_salon_locations(id,salon_id,location_code,state_code,city_name,street_line1,postal_code,timezone_name,is_primary,enabled) VALUES(401,101,'primary','CA','CI','Fixture only','90001','America/Los_Angeles',true,true)");
 await q("INSERT INTO public.services(id,service_id,name,duration_min,price,currency_code) VALUES(601,'601','CI Service',30,0,'USD')");
 await q("INSERT INTO public.salon_master_services(id,salon_id,master_id,service_pk,price,duration_min,currency_code) VALUES(501,101,301,601,0,30,'USD')");
 await q("INSERT INTO public.billing_subscriptions(owner_type,owner_id,amount,currency) VALUES('salon',102,10,'KGS')");
 for(const [id,owner,user,partner,status,slug] of [[1001,101,11,201,"activated","ci-us"],[1003,103,15,203,"provisioned","ci-opening"],[1004,104,16,204,"provisioned","ci-rollback"]]){
  await q("INSERT INTO public.owner_opening_requests(id,owner_type,status,name,email,slug_final,created_owner_id,created_auth_user_id,source_namespace,source_company_id,source_website_id,source_partner_id,source_request_id,precheck_result_json) VALUES($1,'salon',$2,'CI Fixture',$3,$4,$5,$6,'odoo_online',4,5,$7,$8,$9::jsonb)",[id,status,slug+"@example.invalid",slug,owner,user,partner,"odoo-us-partner-"+partner,JSON.stringify({normalized:{market_code:"US"},odoo_source_proof:{ci:true}})]);
 }
 await q("INSERT INTO public.billing_subscriptions(owner_type,owner_id,amount,currency,wallet_only,current_period_start,current_period_end,grace_period_days,provider_namespace,provider_company_id,provider_website_id,provider_partner_id,provider_source_request_id,provider_subscription_order_id,provider_invoice_id,provider_policy_version,provider_verified_at) VALUES('salon',101,0,'USD',false,clock_timestamp()-interval '1 day',clock_timestamp()+interval '30 days',0,'odoo_online',4,5,201,'odoo-us-partner-201',701,801,'ci-v1',clock_timestamp())");
 await isolatedGraph();
 console.log("C6_REAL_PG17_SCHEMA_READY");
});
after(async()=>pool.end());
async function tx(fn){const c=await pool.connect();try{await c.query("BEGIN");const r=await fn(c);await c.query("COMMIT");return r;}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}}
const audit=async(db,{request,eventType,data})=>(await db.query("INSERT INTO public.audit_events(event_type,actor,core_user_id,data) VALUES($1,'ci-test',14,$2::jsonb) RETURNING id",[eventType,JSON.stringify({...data,request_id:Number(request.id)})])).rows[0];
const trace=async(db,{messageId,attempt,status,data})=>(await db.query("INSERT INTO public.traces(message_id,attempt,status,data) VALUES($1,$2,$3,$4::jsonb) RETURNING id",[messageId,attempt,status,JSON.stringify(data)])).rows[0];
const row=async id=>(await q("SELECT * FROM public.owner_opening_requests WHERE id=$1",[id])).rows[0];
const bill=async id=>(await q("SELECT * FROM public.billing_subscriptions WHERE owner_type='salon' AND owner_id=$1",[id])).rows[0];
const market=r=>r.precheck_result_json?.normalized?.market_code||"KG";
test("exact production hard HOLD rejects activation, welcome, reconciliation before any I/O",async()=>{
 assert.equal(commercialWriterRelease().release,"HOLD");
 const p={query:forbidden,connect:forbidden};
 await assert.rejects(()=>activationActual.activateOwnerOpeningCanonical({pool:p}),deny("US_G3_COMMERCIAL_ACTIVATION_RELEASE_HOLD"));
 await assert.rejects(()=>welcomeActual.claimOwnerOpeningWelcome({pool:p}),deny("US_G3_WELCOME_RELEASE_HOLD"));
 await assert.rejects(()=>reconcileActual.reconcileUsSaasOpening({pool:p}),deny("US_SAAS_PROJECTION_RELEASE_HOLD"));
});
test("real CHECK constraints, unique projection and KG wallet unchanged",async()=>{
 await assert.rejects(()=>q("UPDATE public.billing_subscriptions SET provider_namespace=NULL WHERE owner_id=101"),e=>e.code==="23514");
 await assert.rejects(()=>q("UPDATE public.billing_subscriptions SET currency='KGS' WHERE owner_id=101"),e=>e.code==="23514");
 await assert.rejects(()=>q("INSERT INTO public.billing_subscriptions(owner_type,owner_id,amount,currency,wallet_only,current_period_start,current_period_end,grace_period_days,provider_namespace,provider_company_id,provider_website_id,provider_partner_id,provider_source_request_id,provider_subscription_order_id,provider_invoice_id,provider_policy_version,provider_verified_at) SELECT owner_type,999,amount,currency,wallet_only,current_period_start,current_period_end,grace_period_days,provider_namespace,provider_company_id,provider_website_id,provider_partner_id,provider_source_request_id,provider_subscription_order_id,provider_invoice_id,provider_policy_version,provider_verified_at FROM public.billing_subscriptions WHERE owner_id=101"),e=>e.code==="23505");
 assert.equal((await getUsSaasAccess(pool,{ownerType:"salon",ownerId:102})).managed,false);
 const kg=await bill(102);assert.equal(kg.currency,"KGS");assert.equal(kg.wallet_only,true);
});
test("actual tax, price and service link write functions deny under real PG; read remains",async()=>{
 assert.equal((await readUsOwnerServiceTax(pool,opts)).status,200);
 const a=await saveUsOwnerServiceTax(pool,{...opts,body:{rate_bps:100,expected_revision:0}});
 const b=await saveUsOwnerServicePrice(pool,{...opts,serviceLinkId:501,body:{amount_minor:100,expected_version:0}});
 const c=await saveUsServiceLink(pool,{...opts,body:{operation:"create",master_id:301,name:"CI New",duration_min:30,amount_minor:100}});
 for(const x of [a,b,c]){assert.equal(x.status,403);assert.equal(x.body.error,"US_SAAS_COMMERCIAL_ACCESS_DENIED");}
 assert.equal(await scalar("SELECT count(*) AS n FROM public.us_owner_service_tax_settings"),0);
 assert.equal(await scalar("SELECT count(*) AS n FROM public.us_service_price_amounts"),0);
 assert.equal(await scalar("SELECT count(*) AS n FROM public.services"),1);
});
test("actual US profile, location-hours and booking SQL plus KG-only scope",async()=>{
 await assert.rejects(()=>tx(db=>assertProfileWriteScope(db,{req:salonReq,ownerType:"salon",ownerId:101})),deny("US_SAAS_COMMERCIAL_ACCESS_DENIED"));
 await assert.rejects(()=>tx(db=>assertProfileWriteScope(db,{req:masterReq,ownerType:"master",ownerId:301})),deny("US_SAAS_COMMERCIAL_ACCESS_DENIED"));
 await assert.rejects(()=>tx(db=>assertUsHoursWriteScope(db,{req:masterReq,masterId:301,location:{market_id:2,salon_id:101,location_id:401}})),deny("US_SAAS_COMMERCIAL_ACCESS_DENIED"));
 await assert.rejects(()=>tx(db=>assertLegacySalonHoursScope(db,101)),deny("US_HOURS_EXPLICIT_LOCATION_REQUIRED"));
 assert.equal(await tx(db=>assertProfileWriteScope(db,{ownerType:"salon",ownerId:102})), "legacy");
 await tx(db=>assertLegacySalonHoursScope(db,102));
 await tx(db=>assertUsManualBookingSession(db,masterReq,301,"ci-master"));
 await assert.rejects(()=>tx(db=>assertUsBookingAuthority(db,booking)),deny("US_BOOKING_COMMERCIAL_ACCESS_DENIED"));
 await assert.rejects(()=>tx(db=>assertUsBookingAuthority(db,{...booking,location:{...booking.location,id:999}})),deny("US_BOOKING_AUTHORITY_SCOPE_CHANGED"));
 await q("INSERT INTO public.master_salon(id,master_id,salon_id,status) VALUES(2,301,102,'active')");
 try{await assert.rejects(()=>tx(db=>assertProfileWriteScope(db,{req:masterReq,ownerType:"master",ownerId:301})),deny("US_PROFILE_MIXED_MARKET_HOLD"));}
 finally{await q("DELETE FROM public.master_salon WHERE id=2");}
});
test("real row locks serialize entitlement read with revocation, and wallet authority denies Odoo",async()=>{
 await assert.rejects(()=>tx(db=>assertLegacyWalletSubscriptionAuthority(db,"salon",101)),deny("US_SAAS_ODOO_BILLING_AUTHORITY_REQUIRED"));
 await tx(db=>assertLegacyWalletSubscriptionAuthority(db,"salon",102));
 const a=await pool.connect(),b=await pool.connect();
 try{
  await a.query("BEGIN");const x=await getUsSaasAccess(a,{ownerType:"salon",ownerId:101,lock:true});assert.equal(x.can_book,false);
  await b.query("BEGIN");await b.query("SET LOCAL lock_timeout='300ms'");
  await assert.rejects(()=>b.query("UPDATE public.billing_subscriptions SET provider_revoked_at=clock_timestamp() WHERE owner_id=101"),e=>e.code==="55P03");
  await b.query("ROLLBACK");await a.query("COMMIT");
  await b.query("BEGIN");await b.query("UPDATE public.billing_subscriptions SET provider_revoked_at=clock_timestamp() WHERE owner_id=101");await b.query("ROLLBACK");
  assert.equal((await bill(101)).provider_revoked_at,null);
 }finally{await a.query("ROLLBACK").catch(()=>{});await b.query("ROLLBACK").catch(()=>{});a.release();b.release();}
});
const act=async(id,{failAudit=false,receiptPurpose="activate"}={})=>{
 const r=await row(id);
 return activation.activateOwnerOpeningCanonical({pool,requestId:id,admin:{id:14},sourceAdmin,requireUsScope:true,sourceReceipt:receipt(id,receiptPurpose),paidEvidence:evidence(r),getMarketCode:market,assertMarketPolicy:()=>{},assertUsActivationReady:async()=>{},activateEntity:async(db,req)=>({salon:(await db.query("UPDATE public.salons SET enabled=true WHERE id=$1 RETURNING id,enabled",[req.created_owner_id])).rows[0]}),writeAudit:failAudit?async()=>{throw Error("CI_AUDIT_FAIL")}:audit});
};
test("T3 real transaction: fresh purpose, audit rollback, eight concurrent activations",async()=>{
 await assert.rejects(()=>act(1004,{receiptPurpose:"provision"}),deny("US_G3_ACTIVATION_FRESH_SOURCE_REQUIRED"));
 await assert.rejects(()=>act(1004,{failAudit:true}),/CI_AUDIT_FAIL/);
 assert.equal((await row(1004)).status,"provisioned");assert.equal(await bill(104),undefined);
 assert.equal((await q("SELECT enabled FROM public.auth_users WHERE id=16")).rows[0].enabled,false);
 const results=await Promise.all(Array.from({length:8},()=>act(1003)));
 assert.equal(results.filter(x=>x.idempotent===true).length,7);
 assert.equal((await row(1003)).status,"activated");assert.equal((await bill(103)).provider_namespace,"odoo_online");
 assert.equal(await scalar("SELECT count(*) AS n FROM public.billing_subscriptions WHERE owner_id=103"),1);
 assert.equal(await scalar("SELECT count(*) AS n FROM public.audit_events WHERE event_type='owner_opening.activated'"),1);
});
const welcomeArgs={pool,requestId:1003,admin:{id:14},sourceAdmin,requireUsScope:true,getMarketCode:market,assertMarketPolicy:()=>{},assertUsActivationReady:async()=>{},preparePaidEvidence:async r=>evidence(r),prepareSourceReceipt:async()=>receipt(1003,"welcome"),createPreview:async(_db,r)=>({to:r.email,subject:"CI only",html:"<p>CI</p>",text:"CI"}),createTrace:trace,writeAudit:audit};
test("T4 real PG concurrency: twelve claims, one intent, uncertain and positive readback, no Gmail send",async()=>{
 await q("UPDATE public.owner_opening_requests SET status='email_ready',email_status='ready' WHERE id=1003");
 const results=await Promise.allSettled(Array.from({length:12},()=>welcome.claimOwnerOpeningWelcome(welcomeArgs)));
 const good=results.filter(x=>x.status==="fulfilled");assert.equal(good.length,1);
 assert.equal(results.filter(x=>x.status==="rejected"&&x.reason.code==="OWNER_OPENING_WELCOME_RECONCILIATION_REQUIRED").length,11);
 const id=good[0].value.messageId;assert.equal(await scalar("SELECT count(*) AS n FROM public.messages"),1);
 const args={pool,requestId:1003,messageId:id,admin:{id:14},sourceAdmin,requireUsScope:true,createTrace:trace,writeAudit:audit};
 await welcome.markOwnerOpeningWelcomeUncertain(args);
 assert.equal((await row(1003)).status,"email_failed");
 await assert.rejects(()=>welcome.claimOwnerOpeningWelcome(welcomeArgs),deny("OWNER_OPENING_WELCOME_RECONCILIATION_REQUIRED"));
 await assert.rejects(()=>welcome.reconcileOwnerOpeningWelcomeSent({...args,verifyGmailSent:async()=>({verified:false})}),deny("GMAIL_SENT_READBACK_UNVERIFIED"));
 await welcome.reconcileOwnerOpeningWelcomeSent({...args,verifyGmailSent:async proof=>{assert.equal(proof.rfcMessageId,welcome.welcomeRfcMessageId(1003));return {verified:true,providerId:"ci_gmail_ack"};}});
 const repeat=await welcome.claimOwnerOpeningWelcome(welcomeArgs);assert.equal(repeat.kind,"already_sent");
 assert.equal((await row(1003)).status,"email_sent");
 assert.equal(await scalar("SELECT count(*) AS n FROM public.messages"),1);
});
test("T5 real projection renewal and verified cancellation, provider simulated, no new row",async()=>{
 const env={TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED:"true",TOTEM_US_ODOO_SAAS_ACCESS_ENABLED:"true",TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON:JSON.stringify({approved:true,companyId:4,websiteId:5,coveredOwnerTypes:["salon"],allowDeferredRevenuePeriod:true,planId:6,productTemplateId:29,currencyId:2,billingPeriodUnit:"month",billingPeriodValue:1,paymentChannel:"manual",version:"ci-v1"}),TOTEM_US_ODOO_URL:"https://totem-platform.odoo.com",TOTEM_US_ODOO_DB:"totem-platform",TOTEM_US_ODOO_USER:"ci-only",TOTEM_US_ODOO_API_KEY:"ci-only"};
 const run=()=>reconciliation.reconcileUsSaasOpening({pool,requestId:1003,operator:{id:14},sourceAdmin,env,writeAudit:audit});
 const old=await bill(103);await q("UPDATE public.billing_subscriptions SET provider_verified_at=clock_timestamp()-interval '10 seconds' WHERE owner_id=103");
 mode="paid";assert.equal((await run()).status,"PAID_VERIFIED");
 const renewed=await bill(103);assert.equal(renewed.id,old.id);assert.equal(Number(renewed.provider_invoice_id),802);
 assert.ok(new Date(renewed.current_period_end)>new Date(old.current_period_end));
 await q("UPDATE public.billing_subscriptions SET provider_verified_at=clock_timestamp()-interval '10 seconds' WHERE owner_id=103");
 mode="cancel";assert.equal((await run()).status,"REVOKED");
 const revoked=await bill(103);assert.equal(revoked.subscription_status,"blocked");assert.ok(revoked.provider_revoked_at);assert.equal(revoked.id,old.id);
 assert.equal(providerReads,2);assert.equal(await scalar("SELECT count(*) AS n FROM public.billing_subscriptions WHERE owner_id=103"),1);
 const kg=await bill(102);assert.equal(kg.currency,"KGS");assert.equal(kg.wallet_only,true);assert.equal(kg.amount,10);
});
