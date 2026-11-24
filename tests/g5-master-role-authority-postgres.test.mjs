import {activateOwnerOpeningCanonical} from "../src/services/provision/ownerOpeningCanonicalActivation.js";
import {assertUsActivationReady,requestMarketCode} from "../src/services/provision/usOpenOwnerGuards.js";
import {prepareUsPaidActivationEvidence} from "../src/services/provision/usPaidOwnerOpeningGate.js";
import test,{before,beforeEach,after} from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {switchUsOwnSalonRole,resolveUsOwnSalonRoleContext,isUsRoleContextRouteAllowed,listUsOwnSalonRoleOptions} from "../src/auth/usOwnSalonRoleContext.js";
import {prepareUsImportedMasterReceipt,assertUsImportedMasterProvision} from "../src/services/provision/usImportedMasterProvision.js";
import {createUsOdooApprovedSourceClient} from "../src/services/billing/usOdooReadOnlyClient.js";
import {masterSourceFixture,sourceTransport} from "./fixtures/g5-approved-source-fixture.mjs";
import {createMasterCanonical} from "../src/services/provision/createMasterCanonical.js";
import {bindMasterToSalonCanonical} from "../src/services/provision/bindMasterToSalonCanonical.js";
import {readFile} from "node:fs/promises";
import {decideUsExistingSalonConsent,assertUsExistingSalonConsent,readUsOwnSalonMasterAuthority} from "../src/services/provision/usMasterRoleAuthority.js";
const url=process.env.G5_TEST_DATABASE_URL;
if(!url||process.env.DATABASE_URL||process.env.G5_RELEASE_ISOLATED!=="YES")throw Error("G5_RELEASE_ISOLATED_REQUIRED");
const u=new URL(url);if(u.hostname!=="127.0.0.1"||u.pathname!=="/g5_queue_test")throw Error("NONLOCAL");
const db=new pg.Pool({connectionString:url,max:12});
const q=(s,a)=>db.query(s,a);
const env={TOTEM_US_MASTER_CONSENT_ENABLED:"true",TOTEM_US_MASTER_CONSENT_RELEASE_APPROVED:"true",
 TOTEM_US_OWN_SALON_SHARED_ENTITLEMENT_ENABLED:"true",TOTEM_US_ODOO_SAAS_ACCESS_ENABLED:"true",
 TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON:JSON.stringify({approved:true,version:"fixture_v1",ownSalonEntitlement:"single_salon_subscription",coveredOwnerTypes:["salon","master"]})};
const password="fixture-password-not-real";
const hash=await bcrypt.hash(password,4);
Object.assign(env,{TOTEM_US_IMPORTED_MASTER_PROVISION_ENABLED:"true",TOTEM_US_IMPORTED_MASTER_PROVISION_RELEASE_APPROVED:"true",
 TOTEM_US_OWN_SALON_ROLE_CONTEXT_ENABLED:"true",TOTEM_US_OWN_SALON_ROLE_CONTEXT_RELEASE_APPROVED:"true",
 TOTEM_US_OWN_SALON_MASTER_ACTIVATION_ENABLED:"true",TOTEM_US_OWN_SALON_MASTER_ACTIVATION_RELEASE_APPROVED:"true",TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED:"true",
 JWT_SECRET:"fixture-secret-not-real",TOTEM_US_ODOO_URL:"https://totem-platform.odoo.com",
 TOTEM_US_ODOO_DB:"totem-platform",TOTEM_US_ODOO_USER:"fixture",TOTEM_US_ODOO_API_KEY:"fixture"});
const auth={source:"session",role:"salon_admin",user_id:100,session_id:"fixture-owner-session"};
const stamp="2026-11-23 10:00:00",leadStamp="2026-11-23 10:01:00";
const proof=(partner,mode,roleSet,extra={})=>({normalized:{market_code:"US"},odoo_source_proof:{
 source:"odoo_us_approved_profile_v1",odoo_lead_id:partner+1000,source_partner_id:partner,
 source_request_id:"odoo-us-partner-"+partner,profile_write_date:stamp,lead_write_date:leadStamp,
 source_stage_id:82,source_marker:"totem_us_portal_approved_v1",entry_mode:mode,role_set:roleSet,...extra}});
const count=async table=>(await q("SELECT count(*)::int AS n FROM public."+table)).rows[0].n;
before(async()=>{
 assert.equal((await q("SELECT current_database() AS db")).rows[0].db,"g5_queue_test");
 // Previous intake test creates minimal lookup fixtures; replace ONLY in
 // explicitly disposable test database with selected exact table DDL.
 await q("DROP TABLE IF EXISTS public.salons,public.masters,public.markets,public.slug_reservations");
 await q(await readFile(new URL("./sql/g5-master-role-authority-schema.sql",import.meta.url),"utf8"));
 await q("CREATE SEQUENCE public.g5_fixture_masters_seq; ALTER TABLE public.masters ALTER COLUMN id SET DEFAULT nextval(\'public.g5_fixture_masters_seq\'); CREATE SEQUENCE public.g5_fixture_master_salon_seq; ALTER TABLE public.master_salon ALTER COLUMN id SET DEFAULT nextval(\'public.g5_fixture_master_salon_seq\')");
});
beforeEach(async()=>{
 await q("DROP TABLE IF EXISTS public.slug_reservations");
 await q("TRUNCATE public.owner_opening_requests,public.audit_events,public.auth_users,public.auth_sessions,public.owner_salon,public.salons,public.masters,public.master_salon,public.markets,public.tenant_market_settings,public.billing_subscriptions,public.onboarding_state_transitions,public.us_salon_locations,public.us_location_geo_verifications RESTART IDENTITY");
 await q(`INSERT INTO public.markets(id,code,country_code,default_locale,supported_locales,default_currency,supported_currencies,default_timezone,country_pack_code,country_pack_version,active)
 VALUES(4,'US','US','en',ARRAY['en'],'USD',ARRAY['USD'],'America/New_York','US','1',true);
 INSERT INTO public.salons(id,slug,name,status,enabled) VALUES(32,'fixture-salon','Fixture','active',true);
 INSERT INTO public.auth_users(id,email,role,salon_slug,salon_id,phone,enabled) VALUES(100,'fixture-owner@example.invalid','salon_admin','fixture-salon','32','+12125550123',true);
 INSERT INTO public.auth_sessions(id,user_id,expires_at,last_seen_at) VALUES('fixture-owner-session',100,now()+interval '1 hour',now());
 INSERT INTO public.owner_salon(id,owner_id,salon_id,status) VALUES(1,'100',32,'active');
 INSERT INTO public.tenant_market_settings(salon_id,market_id) VALUES(32,4);`);
 await q("UPDATE public.auth_users SET email_verified_at=now(),password_hash=$1 WHERE id=100",[hash]);
});
after(async()=>db.end());
async function req({id,role,mode,partner,createdOwner=null,authUser=null,status="validated",extra={},slug}){
 await q(`INSERT INTO public.owner_opening_requests(id,owner_type,status,name,email,slug_final,salon_slug,phone_normalized,created_owner_id,created_auth_user_id,
 source_namespace,source_company_id,source_website_id,source_partner_id,source_request_id,precheck_result_json)
 VALUES($1,$2,$3,'Fixture','fixture@example.invalid',$4,$5,'+12125550123',$6,$7,'odoo_online',4,5,$8,$9,$10::jsonb)`,
 [id,role,status,slug||"fixture-"+role,role==="master"?"fixture-salon":null,createdOwner,authUser,partner,"odoo-us-partner-"+partner,
 JSON.stringify(proof(partner,mode,mode==="own_salon"?"salon,master":role,extra))]);
}
async function existing(){
 await req({id:1,role:"salon",mode:"salon",partner:20001,createdOwner:32,authUser:100,status:"activated"});
 await req({id:2,role:"master",mode:"existing_salon",partner:20002,extra:{target_salon_partner_id:20001,target_salon_slug:"fixture-salon",target_salon_write_date:stamp}});
}
const decide=(decision,extra={})=>decideUsExistingSalonConsent({pool:db,requestId:2,auth,decision,password,env,...extra});
async function grant(){const r=await decide("read");return decide("grant",{expectedFingerprint:r.revision});}
async function verify(){const c=await db.connect();try{await c.query("BEGIN");const r=(await c.query("SELECT * FROM public.owner_opening_requests WHERE id=2 FOR UPDATE")).rows[0];return await assertUsExistingSalonConsent(c,r);}finally{await c.query("ROLLBACK");c.release();}}
test("HOLD without DB access",async()=>{
 await assert.rejects(()=>decide("read",{env:{},pool:{connect:()=>{throw Error("DB")}}}),/CONSENT_HOLD/);
});
test("direct owner consent: 24 duplicate grants one audit and no membership or user",async()=>{
 await existing();const r=await decide("read");assert.equal(r.consent,"REQUIRED");assert.equal(r.applicant.slug,"fixture-master");
 assert.equal(await count("audit_events"),0);
 await assert.rejects(()=>decide("grant",{expectedFingerprint:"0".repeat(64)}),/REVISION_REQUIRED/);
 const a=await Promise.all(Array.from({length:24},()=>decide("grant",{expectedFingerprint:r.revision})));
 assert.equal(a.filter(x=>!x.idempotent).length,1);assert.equal(await count("audit_events"),1);
 assert.equal((await verify()).salonId,32);assert.equal(await count("auth_users"),1);assert.equal(await count("masters"),0);assert.equal(await count("master_salon"),0);assert.equal(await count("billing_subscriptions"),0);
 const z=await decide("revoke");assert.equal(z.consent,"REQUIRED");assert.equal((await decide("revoke")).idempotent,true);
 await assert.rejects(verify,/CONSENT_REQUIRED/);assert.equal(await count("audit_events"),2);
});
test("no legacy token, different principal, master role or revoked session",async()=>{
 await existing();
 for(const a of [{...auth,source:"jwt_legacy"},{...auth,user_id:101},{...auth,role:"master"}])
  await assert.rejects(()=>decide("read",{auth:a}),/DIRECT_OWNER_REQUIRED/);
 await q("UPDATE public.auth_sessions SET revoked_at=NOW()");
 await assert.rejects(()=>decide("read"),/SESSION_INVALID/);assert.equal(await count("audit_events"),0);
});
test("ownership, source revision and expiry are independently rechecked before binding",async()=>{
 await existing();await grant();
 await q("UPDATE public.owner_salon SET status='inactive'");
 await assert.rejects(verify,/TARGET_OWNER_NOT_VERIFIED/);
 await q("UPDATE public.owner_salon SET status='active'");
 await q("UPDATE public.owner_opening_requests SET precheck_result_json=jsonb_set(precheck_result_json,'{master_owner_consent,expires_at}',to_jsonb('2000-01-01T00:00:00Z'::text)) WHERE id=2");
 await assert.rejects(verify,/CONSENT_REQUIRED/);
 await grant();
 await q("UPDATE public.owner_opening_requests SET precheck_result_json=jsonb_set(precheck_result_json,'{odoo_source_proof,lead_write_date}',to_jsonb('2026-11-23 10:03:00'::text)) WHERE id=2");
 await assert.rejects(verify,/CONSENT_REQUIRED/);
 await q("UPDATE public.owner_opening_requests SET precheck_result_json=jsonb_set(precheck_result_json,'{odoo_source_proof,profile_write_date}',to_jsonb('2026-11-23 10:02:00'::text)) WHERE id=1");
 await assert.rejects(()=>decide("read"),/TARGET_SOURCE_REVIEW_REQUIRED/);
});
test("consent audit failure rolls back decision",async()=>{
 await existing();const r=await decide("read");
 const p={connect:async()=>{const c=await db.connect();return {query:(s,a)=>String(s).includes("INSERT INTO public.audit_events")?Promise.reject(Error("FIXTURE_AUDIT_FAILURE")):c.query(s,a),release:()=>c.release()}}};
 await assert.rejects(()=>decide("grant",{pool:p,expectedFingerprint:r.revision}),/FIXTURE_AUDIT_FAILURE/);
 await assert.rejects(verify,/CONSENT_REQUIRED/);assert.equal(await count("audit_events"),0);
});
async function own(){
 await req({id:1,role:"salon",mode:"own_salon",partner:20001,createdOwner:32,authUser:100,status:"activated"});
 await req({id:2,role:"master",mode:"own_salon",partner:20001,createdOwner:46,authUser:100,status:"provisioned"});
 await q(`INSERT INTO public.masters(id,slug,name,user_id,active) VALUES(46,'fixture-master','Fixture Master',100,false);
 INSERT INTO public.master_salon(id,master_id,salon_id,status) VALUES(1,46,32,'active');
 INSERT INTO public.billing_subscriptions(owner_type,owner_id,amount,currency,wallet_only,grace_period_days,
 current_period_start,current_period_end,provider_namespace,provider_company_id,provider_website_id,provider_partner_id,
 provider_source_request_id,provider_subscription_order_id,provider_invoice_id,provider_policy_version,provider_verified_at)
 VALUES('salon',32,0,'USD',false,0,now()-interval '1 day',now()+interval '29 days','odoo_online',4,5,20001,
 'odoo-us-partner-20001',30001,40001,'fixture_v1',now());`);
}
const authority=()=>readUsOwnSalonMasterAuthority(db,2,{env});
test("own_salon exact same principal and one salon projection, no session grant, no second payment",async()=>{
 await own();const r=await authority();assert.equal(r.principalAuthUserId,100);assert.equal(r.masterId,46);assert.equal(r.salonId,32);
 assert.equal(r.subscriptionOrderId,30001);assert.equal(r.roleActivationAuthorized,false);
 assert.equal(await count("auth_users"),1);assert.equal(await count("billing_subscriptions"),1);assert.equal(await count("auth_sessions"),1);
});
test("own_salon rejects foreign principal and double projection, stale and revoked salon proof",async()=>{
 await own();await q("UPDATE public.owner_opening_requests SET created_auth_user_id=101 WHERE id=2");
 await assert.rejects(authority,/SHARED_IDENTITY_REQUIRED/);
 await q("UPDATE public.owner_opening_requests SET created_auth_user_id=100 WHERE id=2");
 await q("INSERT INTO public.billing_subscriptions(owner_type,owner_id,amount,currency) VALUES('master',46,0,'USD')");
 await assert.rejects(authority,/SINGLE_PROJECTION_REQUIRED/);
 await q("DELETE FROM public.billing_subscriptions WHERE owner_type='master'");
 await q("UPDATE public.billing_subscriptions SET provider_verified_at=now()-interval '301 seconds'");
 await assert.rejects(authority,/EVIDENCE_STALE/);
 await q("UPDATE public.billing_subscriptions SET provider_verified_at=now(),subscription_status='blocked'");
 await assert.rejects(authority,/REVOKED_OR_BLOCKED/);
});

test("legacy session alone cannot authorize consent without password",async()=>{
 await existing();
 await assert.rejects(()=>decide("read",{password:undefined}),/REAUTH_REQUIRED/);
 await assert.rejects(()=>decide("read",{password:"wrong"}),/REAUTH_REQUIRED/);
 assert.equal(await count("audit_events"),0);
});
async function activeOwn(){
 await own();
 await q("UPDATE public.owner_opening_requests SET status='activated' WHERE id=2");
 await q("UPDATE public.masters SET active=true WHERE id=46");
}
const switchRole=(extra={})=>switchUsOwnSalonRole({pool:db,auth,role:"master",masterRequestId:2,password,env,...extra});
test("existing principal and session: signed limited master role and switch back, no additional account or session",async()=>{
 await activeOwn();
 const options=await listUsOwnSalonRoleOptions(db,{auth,env});
 assert.deepEqual(options,[{role:"master",master_request_id:2,master_slug:"fixture-master",salon_slug:"fixture-salon"}]);
 assert.deepEqual(await listUsOwnSalonRoleOptions(db,{auth:{...auth,user_id:999},env}),[]);
 assert.deepEqual(await listUsOwnSalonRoleOptions(db,{auth,env:{}}),[]);
 const r=await switchRole(),payload=jwt.verify(r.access_token,env.JWT_SECRET);
 assert.equal(payload.user_id,100);assert.equal(payload.role,"master");assert.equal(payload.session_id,auth.session_id);
 assert.equal(payload.us_master_request_id,2);assert.ok(r.expires_in<=300);
 const session={role:"salon_admin",enabled:true,user_id:100};
 const ctx=await resolveUsOwnSalonRoleContext(db,{payload,session,req:{method:"GET",path:"/masters/fixture-master"},env});
 assert.deepEqual(ctx.identity.masters,[46]);assert.deepEqual(ctx.identity.salons,[]);
 for(const req of [{method:"GET",path:"/masters/other"},{method:"GET",path:"/salons/fixture-salon"},{method:"PUT",path:"/masters/fixture-master"}])
  await assert.rejects(()=>resolveUsOwnSalonRoleContext(db,{payload,session,req,env}),/ROUTE_HOLD/);
 const back=await switchRole({auth:{...auth,role:"master",us_role_context:"own_salon_master_v1",master_request_id:2},role:"salon_admin"});
 assert.equal(jwt.verify(back.access_token,env.JWT_SECRET).role,"salon_admin");
 assert.equal(await count("auth_users"),1);assert.equal(await count("auth_sessions"),1);assert.equal(await count("billing_subscriptions"),1);
 assert.equal(await count("audit_events"),2);
});
test("role context fails closed on HOLD, missing activation, wrong password, foreign owner, revoked session and stale payment",async()=>{
 await own();
 await assert.rejects(()=>switchRole({env:{}}),/CONTEXT_HOLD/);
 await assert.rejects(switchRole,/NOT_ACTIVE/);
 await q("UPDATE public.owner_opening_requests SET status='activated' WHERE id=2");await q("UPDATE public.masters SET active=true");
 await assert.rejects(()=>switchRole({password:"wrong"}),/REAUTH_REQUIRED/);
 await assert.rejects(()=>switchRole({masterRequestId:999}),/NOT_ACTIVE/);
 const r=await switchRole(),payload=jwt.verify(r.access_token,env.JWT_SECRET);
 const session={role:"salon_admin",enabled:true,user_id:100};
 await q("UPDATE public.billing_subscriptions SET provider_verified_at=now()-interval '301 seconds'");
 await assert.rejects(()=>resolveUsOwnSalonRoleContext(db,{payload,session,req:{method:"GET",path:"/auth/session/resolve"},env}),/EVIDENCE_STALE/);
 await q("UPDATE public.auth_sessions SET revoked_at=now()");
 await assert.rejects(switchRole,/SESSION_INVALID/);
});
async function freshSource(mode){
 const f=masterSourceFixture(mode),p=f.partner,l=f.lead;
 const partner=mode==="own_salon"?20001:20002;
 const email=mode==="own_salon"?"fixture-owner@example.invalid":"applicant@example.invalid";
 const phone=mode==="own_salon"?"+12125550123":"+12125550124";
 p.id=partner;p.email=email;p.phone=phone;l.id=partner+1000;l.email_from=email;l.phone=phone;
 l.partner_id=[partner,"fixture"];l.x_totem_us_source_partner_id=[partner,"fixture"];l.x_totem_us_source_key="odoo-us-partner-"+partner;
 if(mode==="existing_salon"){f.target.id=20001;f.target.x_totem_us_business_slug="fixture-salon";p.x_totem_us_master_salon_id=[20001,"fixture"];l.x_totem_us_salon_slug="fixture-salon";}
 await q("UPDATE public.owner_opening_requests SET name=$1,email=$2,phone_normalized=$3,work_mode='attached_to_salon',specialization='Hair' WHERE id=2",[p.name,email,phone]);
 if(mode==="own_salon")await q("UPDATE public.owner_opening_requests SET precheck_result_json=jsonb_set(precheck_result_json,'{odoo_source_proof,target_salon_slug}',to_jsonb('fixture-salon'::text)) WHERE id=2");
 const tr=sourceTransport(f);
 return {f,read:()=>prepareUsImportedMasterReceipt(db,2,{env,createClient:o=>createUsOdooApprovedSourceClient({...o,fetchImpl:tr.fetchImpl})})};
}
function withFlags(work){
 const keys=Object.keys(env).filter(k=>k.startsWith("TOTEM_"));
 const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 for(const k of keys)process.env[k]=env[k];
 return Promise.resolve().then(work).finally(()=>{for(const k of keys){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}});
}
async function provision(receipt){
 return withFlags(async()=>{
 const c=await db.connect();
 try{
  await c.query("BEGIN");
  const row=(await c.query("UPDATE public.owner_opening_requests SET status='provisioning' WHERE id=2 AND status='approved' RETURNING *")).rows[0];
  assert.ok(row);
  const result=await createMasterCanonical({pool:db,dbClient:c,masterReceipt:receipt,payload:{email:row.email,name:row.name,phone:row.phone_normalized,master_slug:row.slug_final,market_code:"US"}});
  const ownerId=Number(result.owner_id),userId=Number(result.result.user.id);
  await bindMasterToSalonCanonical({pool:db,dbClient:c,verifiedUsAdminProvision:true,masterReceipt:receipt,payload:{salon_slug:row.salon_slug,master_slug:row.slug_final,bind_mode:"active",required_market_code:"US",create_contract:false}});
  await c.query("UPDATE public.owner_opening_requests SET status='provisioned',created_owner_id=$1,created_auth_user_id=$2 WHERE id=2",[ownerId,userId]);
  await c.query("COMMIT");return {ownerId,userId};
 }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 });
}
test("canonical own_salon provision reuses existing principal and creates only inactive master plus exact relation",async()=>{
 await own();await q("DELETE FROM public.master_salon; DELETE FROM public.masters; UPDATE public.owner_opening_requests SET status='approved',created_owner_id=NULL,created_auth_user_id=NULL WHERE id=2");
 const f=await freshSource("own_salon"),receipt=await f.read();
 const result=await provision(receipt);
 assert.equal(result.userId,100);assert.equal(await count("auth_users"),1);assert.equal(await count("billing_subscriptions"),1);
 assert.equal(await count("masters"),1);assert.equal(await count("master_salon"),1);
 assert.equal((await q("SELECT active,user_id FROM public.masters")).rows[0].active,false);
 assert.equal((await q("SELECT role,master_slug FROM public.auth_users")).rows[0].master_slug,null);
 await assert.rejects(switchRole,/NOT_ACTIVE/);
});
test("canonical existing_salon requires real consent, rechecks on bind and rolls back on withdrawal",async()=>{
 await existing();const f=await freshSource("existing_salon");
 await q("UPDATE public.owner_opening_requests SET status='approved' WHERE id=2");
 const receipt=await f.read();
 await assert.rejects(()=>provision(receipt),/CONSENT_REQUIRED/);
 await grant();await decide("revoke");
 await assert.rejects(async()=>provision(await f.read()),/CONSENT_REQUIRED/);
 assert.equal(await count("masters"),0);assert.equal(await count("master_salon"),0);assert.equal(await count("auth_users"),1);
 await grant();
 const result=await provision(await f.read());
 assert.notEqual(result.userId,100);assert.equal(await count("auth_users"),2);assert.equal(await count("masters"),1);assert.equal(await count("master_salon"),1);
 assert.equal((await q("SELECT enabled FROM public.auth_users WHERE id=$1",[result.userId])).rows[0].enabled,false);
 assert.equal(await count("billing_subscriptions"),0);
});
test("canonical bind cannot bypass receipt for an imported master even with legacy Admin flag",async()=>{
 await existing();await q("UPDATE public.owner_opening_requests SET status='provisioning' WHERE id=2; INSERT INTO public.masters(id,slug,name,user_id,active) VALUES(46,'fixture-master','Fixture',100,false)");
 await withFlags(()=>assert.rejects(()=>bindMasterToSalonCanonical({pool:db,verifiedUsAdminProvision:true,payload:{salon_slug:"fixture-salon",master_slug:"fixture-master",bind_mode:"active",required_market_code:"US"}}),/FRESH_SOURCE_REQUIRED/));
 assert.equal(await count("master_salon"),0);
});

async function geoReady(){
 await q(`INSERT INTO public.us_salon_locations(id,salon_id,location_code,state_code,city_name,street_line1,postal_code,timezone_name,is_primary,enabled)
 VALUES(91,32,'main','NY','New York','100 Fixture St','10001','America/New_York',true,true);
 INSERT INTO public.us_location_geo_verifications(location_id,status,address_fingerprint_sha256,source_version,dataset_sha256,census_benchmark,
 census_matched_address,census_state_code,census_zip5,resolved_timezone,latitude,longitude,boundary_distance_m,checked_at,expires_at)
 SELECT id,'VERIFIED_GEOMETRY',public.us_geo_location_fingerprint(state_code,city_name,street_line1,street_line2,postal_code,timezone_name),
 '2026d','2da5f1e980e70f53c781e1416e8e47bee03b98160353951c886a9901f525550a','Public_AR_Current','Fixture synthetic','NY','10001','America/New_York',40.7,-74,500,now()-interval '1 minute',now()+interval '1 day'
 FROM public.us_salon_locations WHERE id=91;`);
}
async function ownActivationFixture(){
 await own();const f=await freshSource("own_salon");await geoReady();return f;
}
async function runOwnActivation(receipt,overrides={}){
 return withFlags(async()=>{
  const {activateOwnerOpeningEntity}=await import("../src/routes/internal/adminOpenOwner.js");
  return activateOwnerOpeningCanonical({pool:db,requestId:2,admin:{id:900,email:"fixture-admin@example.invalid"},
   masterReceipt:receipt,getMarketCode:requestMarketCode,assertMarketPolicy:()=>{},assertUsActivationReady,
   activateEntity:activateOwnerOpeningEntity,writeAudit:async(c,{request,eventType,data})=>
    (await c.query("INSERT INTO public.audit_events(event_type,actor,core_user_id,data) VALUES($1,'fixture-admin',$2,$3::jsonb) RETURNING id",
    [eventType,request.created_auth_user_id,JSON.stringify(data)])).rows[0],...overrides});
 });
}
test("canonical own_salon activation uses existing paid salon, same principal, one projection, real entity writer and one audit",async()=>{
 const f=await ownActivationFixture(),receipt=await f.read();
 const results=await runOwnActivation(receipt);
 assert.equal(results.request.status,"activated");
 assert.equal(results.owner_activation.master.active,true);
 assert.equal(Number(results.owner_activation.master.user_id),100);
 assert.equal(await count("auth_users"),1);assert.equal(await count("auth_sessions"),1);
 assert.equal(await count("billing_subscriptions"),1);assert.equal(await count("audit_events"),1);
 const row=(await q("SELECT data FROM public.audit_events")).rows[0].data;
 assert.equal(row.shared_salon_subscription,true);assert.equal(row.odoo_subscription_order_id,30001);
 assert.equal((await runOwnActivation(null)).idempotent,true);
 assert.equal(await count("audit_events"),1);
 const token=await switchRole();assert.equal(jwt.verify(token.access_token,env.JWT_SECRET).auth_session_version,2);
});
test("own_salon activation rejects missing receipt, stale payment, second projection and expired geo",async()=>{
 const f=await ownActivationFixture();
 await assert.rejects(()=>runOwnActivation(null),/FRESH_SOURCE_REQUIRED/);
 await q("UPDATE public.billing_subscriptions SET provider_verified_at=now()-interval '301 seconds'");
 await assert.rejects(async()=>runOwnActivation(await f.read()),/EVIDENCE_STALE/);
 await q("UPDATE public.billing_subscriptions SET provider_verified_at=now()");
 await q("INSERT INTO public.billing_subscriptions(owner_type,owner_id,amount,currency) VALUES('master',46,0,'USD')");
 await assert.rejects(async()=>runOwnActivation(await f.read()),/SINGLE_PROJECTION_REQUIRED/);
 await q("DELETE FROM public.billing_subscriptions WHERE owner_type='master'");
 await q("UPDATE public.us_location_geo_verifications SET checked_at=now()-interval '2 days',expires_at=now()-interval '1 day'");
 await assert.rejects(async()=>runOwnActivation(await f.read()),/US_LOCATION_NOT_READY/);
 assert.equal((await q("SELECT active FROM public.masters")).rows[0].active,false);
 assert.equal((await q("SELECT status FROM public.owner_opening_requests WHERE id=2")).rows[0].status,"provisioned");
 assert.equal(await count("audit_events"),0);
});
test("own_salon audit failure rolls back activation; second payment receipt cannot be supplied",async()=>{
 const f=await ownActivationFixture();
 await assert.rejects(async()=>runOwnActivation(await f.read(),{paidEvidence:{status:"PAID_VERIFIED"}}),/SECOND_PAID_RECEIPT_FORBIDDEN/);
 await assert.rejects(async()=>runOwnActivation(await f.read(),{writeAudit:async()=>null}),/ACTIVATION_AUDIT_REQUIRED/);
 assert.equal((await q("SELECT active FROM public.masters")).rows[0].active,false);
 assert.equal(await count("billing_subscriptions"),1);assert.equal(await count("audit_events"),0);
});
test("shared master never requests its own Odoo paid receipt or second billing projection",async()=>{
 await own();const r=(await q("SELECT * FROM public.owner_opening_requests WHERE id=2")).rows[0];
 const denied=await prepareUsPaidActivationEvidence(r,{env,createClient:()=>{throw Error("UNEXPECTED_RPC");}});
 assert.equal(denied.status,"WAIT");assert.equal(denied.reason,"US_OWN_SALON_SHARED_SUBSCRIPTION_NO_SECOND_PAID_RECEIPT");
});


// Real resolver + commercial middleware + canonical profile handlers against
// the same disposable PostgreSQL fixture. No external services.
test("shared Master profile HTTP: one salon entitlement, scope and transaction-time revocation",async()=>{
 await activeOwn();
 const {default:express}=await import("express");
 const {resolveAuth}=await import("../src/middleware/resolveAuth.js");
 const {buildUsSaasCommercialGuard}=await import("../src/middleware/usSaasCommercialGuard.js");
 const {default:buildMastersRouter}=await import("../src/routes/internal/masters.js");
 const config={...env,TOTEM_US_SHARED_MASTER_PROFILE_ENABLED:"true",TOTEM_US_SHARED_MASTER_PROFILE_RELEASE_APPROVED:"true"};
 const previous=Object.fromEntries(Object.keys(config).map(k=>[k,process.env[k]]));
 Object.assign(process.env,config);
 let beforeHandler=null;
 const app=express();app.use(express.json());
 app.use((req,res,next)=>{
   if(req.headers.origin==="http://127.0.0.1:4173"){
     res.set("Access-Control-Allow-Origin",req.headers.origin);
     res.set("Access-Control-Allow-Methods","GET, POST, PUT, PATCH, OPTIONS");
     res.set("Access-Control-Allow-Headers","Authorization, Content-Type, Idempotency-Key, X-Totem-Locale, Accept");
     if(req.method==="OPTIONS")return res.sendStatus(204);
   }next();
 });
 app.use("/internal",(req,res,next)=>resolveAuth(req,res,next,{withClient:async fn=>{
   const c=await db.connect();try{return await fn(c);}finally{c.release();}
 }}),buildUsSaasCommercialGuard(db),async(_req,_res,next)=>{
   try{if(beforeHandler){const action=beforeHandler;beforeHandler=null;await action();}next();}
   catch(err){next(err);}
 },buildMastersRouter(db,(_req,_res,next)=>next()));
 const server=app.listen(0,"127.0.0.1");
 try{
  await new Promise((resolve,reject)=>{server.once("listening",resolve);server.once("error",reject);});
  const base="http://127.0.0.1:"+server.address().port+"/internal";
  const {access_token:token}=await switchRole();
  const path="/masters/fixture-master";
  const call=async(p=path,method="GET",data,authToken=token)=>{
    const r=await fetch(base+p,{method,headers:{Authorization:"Bearer "+authToken,"Content-Type":"application/json"},...(data?{body:JSON.stringify(data)}:{})});
    return {status:r.status,body:await r.json()};
  };
  const currentName=async()=>(await q("SELECT name FROM public.masters WHERE id=46")).rows[0].name;
  let a=await call();assert.equal(a.status,200,JSON.stringify(a.body));
  assert.equal(a.body.profile_can_write,true);assert.equal(a.body.billing_access.can_withdraw,false);
  assert.equal(a.body.billing_access.can_write,false);
  const body={revision:a.body.profile_revision,profile:{name:"New fixture master"}};
  delete process.env.TOTEM_US_SHARED_MASTER_PROFILE_RELEASE_APPROVED;
  assert.equal((await call()).body.profile_can_write,false);
  assert.equal((await call(path,"PATCH",body)).status,403);
  process.env.TOTEM_US_SHARED_MASTER_PROFILE_RELEASE_APPROVED="true";
  for(const [p,m] of [["/masters/other","PATCH"],[path+"/services","POST"],[path+"/billing/unblock","POST"],["/salons/fixture-salon","PATCH"]]){
   assert.equal((await call(p,m,body)).status,403);
  }
  a=await call(path,"PATCH",body);assert.equal(a.status,200,JSON.stringify(a.body));assert.equal(a.body.profile_saved,true);
  assert.equal(await currentName(),"New fixture master");
  assert.equal((await call(path,"PATCH",body)).status,409);
  const next={revision:a.body.profile_revision,profile:{name:"Second fixture master"}};
  const reject=async()=>{const r=await call(path,"PATCH",next);assert.equal(r.status,403,JSON.stringify(r.body));assert.equal(await currentName(),"New fixture master");};
  const restore=()=>q("UPDATE public.billing_subscriptions SET current_period_end=now()+interval '30 days',provider_verified_at=now(),subscription_status='active',provider_revoked_at=NULL");
  await q("UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp()");await reject();await restore();
  await q("UPDATE public.billing_subscriptions SET provider_verified_at=now()-interval '301 seconds'");await reject();await restore();
  await q("UPDATE public.billing_subscriptions SET subscription_status='blocked',provider_revoked_at=now()");await reject();await restore();
  await q("INSERT INTO public.billing_subscriptions(owner_type,owner_id,amount,currency) VALUES('master',46,0,'USD')");await reject();
  await q("DELETE FROM public.billing_subscriptions WHERE owner_type='master'");
  // A valid initial guard is not sufficient: simulate expiry between it and the actual handler.
  beforeHandler=()=>q("UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp()");
  await reject();assert.equal(beforeHandler,null);await restore();
  // Same check for session revocation between the two boundaries.
  beforeHandler=()=>q("UPDATE public.auth_sessions SET revoked_at=now()");
  await reject();assert.equal(beforeHandler,null);
  await reject();
  await q("UPDATE public.auth_sessions SET revoked_at=NULL");
  const recovered=await call(path,"PATCH",next);assert.equal(recovered.status,200,JSON.stringify(recovered.body));
  assert.equal(await currentName(),"Second fixture master");
  assert.equal(await count("billing_subscriptions"),1);assert.equal(await count("auth_users"),1);assert.equal(await count("auth_sessions"),1);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
 }
});


// Reuse the already maintained service table fixture; real router, real PG,
// no second commercial projection and no external billing calls.
test("shared Master service links, USD price, weekly hours and manual booking HTTP: scope, rollback and same-row recovery",async()=>{
 await activeOwn();
 const ddl=await readFile(new URL("./sql/us_services_01_isolated_fixture.sql",import.meta.url),"utf8");
 const first=ddl.indexOf("CREATE TABLE public.services("),last=ddl.indexOf("INSERT INTO public.auth_users",first);
 assert.ok(first>=0&&last>first);
 await q(ddl.slice(first,last));
 const sessionId="11111111-2222-4333-8444-555555555555";
 await q("UPDATE public.auth_sessions SET id=$1",[sessionId]);
 await q("INSERT INTO public.masters(id,slug,name,user_id,active) VALUES(47,'fixture-other-master','Other',100,true); INSERT INTO public.master_salon(id,master_id,salon_id,status) VALUES(2,47,32,'active');");
 await q("INSERT INTO public.services(service_id,name,duration_min,price) VALUES('10','Other master catalog',30,0); INSERT INTO public.salon_master_services(salon_id,master_id,service_pk,price,duration_min,active,currency_code) VALUES(32,47,1,0,30,true,'USD');");
 const {default:express}=await import("express");
 const {resolveAuth}=await import("../src/middleware/resolveAuth.js");
 const {buildUsSaasCommercialGuard}=await import("../src/middleware/usSaasCommercialGuard.js");
 const {buildUsServicePricesRouter}=await import("../src/routes/internalUsServicePrices.js");
 const {default:buildMastersRouter}=await import("../src/routes/internal/masters.js");
 const {buildUsMasterManualBookingRouter}=await import("../src/routes/internalUsMasterManualBooking.js");
 const {buildOwnerRoleSessionRouter}=await import("../src/routes/internalOwnerRoleSession.js");
 const {buildPublicCreateBooking}=await import("../src/routes/publicCreateBooking.js");
 const {buildUsPayC11OwnerRouter}=await import("../src/routes/internalUsPayC11Owner.js");
 const {buildUsServiceTaxSettingsRouter}=await import("../src/routes/internalUsServiceTaxSettings.js");
 const {buildUsServiceTaxQuoteRouter}=await import("../src/routes/internalUsServiceTaxQuote.js");
 const {resolveBusinessMarketContext}=await import("../src/market-context/BusinessContext.js");
 const config={...env,TOTEM_US_SHARED_MASTER_SERVICES_ENABLED:"true",TOTEM_US_SHARED_MASTER_SERVICES_RELEASE_APPROVED:"true",TOTEM_US_SHARED_MASTER_PRICE_ENABLED:"false",TOTEM_US_SHARED_MASTER_PRICE_RELEASE_APPROVED:"false",TOTEM_US_SHARED_MASTER_HOURS_ENABLED:"false",TOTEM_US_SHARED_MASTER_HOURS_RELEASE_APPROVED:"false",TOTEM_US_SHARED_MASTER_BOOKING_ENABLED:"false",TOTEM_US_SHARED_MASTER_BOOKING_RELEASE_APPROVED:"false",TOTEM_US_SHARED_MASTER_PROFILE_ENABLED:"true",TOTEM_US_SHARED_MASTER_PROFILE_RELEASE_APPROVED:"true",VAPID_PUBLIC_KEY:"",VAPID_PRIVATE_KEY:"",VAPID_SUBJECT:""};
 const previous=Object.fromEntries(Object.keys(config).map(k=>[k,process.env[k]]));
 Object.assign(process.env,config);
 let beforeHandler=null;
 const app=express();app.use(express.json());
 // Intentionally omit the early public access guard: prove the canonical
 // booking writer itself denies revoked entitlement and rolls back.
 app.post("/fixture-public/:slug/bookings",async(req,res,next)=>{
   try{req.market_context=await resolveBusinessMarketContext(db,{salonSlug:req.params.slug});next();}catch(e){next(e);}
 },buildPublicCreateBooking(db));
 app.use("/internal",(req,res,next)=>resolveAuth(req,res,next,{withClient:async fn=>{
   const c=await db.connect();try{return await fn(c);}finally{c.release();}
 }}),buildUsSaasCommercialGuard(db),async(_req,_res,next)=>{
   try{if(beforeHandler){const action=beforeHandler;beforeHandler=null;await action();}next();}catch(err){next(err);}
 },buildOwnerRoleSessionRouter(db,(_req,_res,next)=>next()),buildUsServicePricesRouter(db),buildUsMasterManualBookingRouter(db),buildUsPayC11OwnerRouter(db),buildUsServiceTaxSettingsRouter(db),buildUsServiceTaxQuoteRouter(db),buildMastersRouter(db,(_req,_res,next)=>next()));
 const server=app.listen(0,"127.0.0.1");
 try{
  await new Promise((resolve,reject)=>{server.once("listening",resolve);server.once("error",reject);});
  const origin="http://127.0.0.1:"+server.address().port+"/internal";
  const {access_token:token}=await switchRole({auth:{...auth,session_id:sessionId}});
  const salonToken=jwt.sign({user_id:100,role:"salon_admin",session_id:sessionId,auth_session_version:2},env.JWT_SECRET,{expiresIn:300});
  const path="/us-service-links/master/fixture-master";
  const call=async(p,method="GET",body,accessToken=token,extraHeaders={})=>{
   const r=await fetch(origin+p,{method,headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json",...extraHeaders},...(body?{body:JSON.stringify(body)}:{})});
   return {status:r.status,body:await r.json()};
  };
  const totals=async()=>Promise.all(["services","salon_master_services","us_service_price_amounts"].map(count));
  const body={operation:"create",salon_slug:"fixture-salon",name:"Fixture haircut",duration_min:45,amount_minor:1250};
  delete process.env.TOTEM_US_SHARED_MASTER_SERVICES_RELEASE_APPROVED;
  assert.equal((await call(path+"/options")).status,403);
  assert.equal((await call(path,"POST",body)).status,403);
  process.env.TOTEM_US_SHARED_MASTER_SERVICES_RELEASE_APPROVED="true";
  let a=await call(path+"/options");assert.equal(a.status,200,JSON.stringify(a.body));
  assert.deepEqual(a.body.salons.map(x=>x.id),[32]);assert.deepEqual(a.body.catalog_services,[]);
  assert.equal((await call("/us-service-links/master/fixture-other-master/options")).status,403);
  assert.equal((await call("/us-service-links/salon/fixture-salon","POST",{...body,master_id:47})).status,403);
  assert.equal((await call("/us-service-prices/master/fixture-master/1","PUT",{amount_minor:10,expected_price_version:1})).status,403);
  assert.equal((await call(path,"POST",{...body,salon_slug:"foreign-salon"})).status,404);
  assert.equal((await call(path,"POST",{operation:"attach",salon_slug:"fixture-salon",service_pk:1,duration_min:30,amount_minor:1100})).status,404);
  assert.deepEqual(await totals(),[1,1,0]);
  a=await call(path,"POST",body);assert.equal(a.status,200,JSON.stringify(a.body));assert.equal(a.body.service.master_id,46);
  assert.equal(a.body.service.salon_id,32);assert.equal(a.body.service.amount_minor,"1250");assert.equal(a.body.readback_verified,true);
  const servicePk=a.body.service.service_pk;
  const serviceList=await call("/masters/fixture-master/services");assert.equal(serviceList.status,200,JSON.stringify(serviceList.body));assert.equal(serviceList.body.services.length,1);assert.equal(Number(serviceList.body.services[0].master_id),46);assert.equal(Number(serviceList.body.services[0].salon_id),32);
  assert.deepEqual(await totals(),[2,2,1]);
  a=await call(path+"/options");assert.equal(a.status,200,JSON.stringify(a.body));assert.deepEqual(a.body.catalog_services.map(x=>x.service_pk),[servicePk]);
  assert.equal((await call(path,"POST",{operation:"attach",salon_slug:"fixture-salon",service_pk:servicePk,duration_min:30,amount_minor:1100})).status,409);
  const pending={...body,name:"Fixture second haircut"};
  const reject=async()=>{const r=await call(path,"POST",pending);assert.equal(r.status,403,JSON.stringify(r.body));assert.deepEqual(await totals(),[2,2,1]);};
  const restore=()=>q("UPDATE public.billing_subscriptions SET current_period_end=now()+interval '30 days',provider_verified_at=now(),subscription_status='active',provider_revoked_at=NULL");
  await q("UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp()");
  await reject();
  const salonBody={operation:"create",master_id:46,name:"Denied salon write",duration_min:30,amount_minor:500};
  assert.equal((await call("/us-service-links/salon/fixture-salon","POST",salonBody,salonToken)).status,403);
  await restore();
  await q("UPDATE public.billing_subscriptions SET provider_verified_at=now()-interval '301 seconds'");await reject();await restore();
  await q("UPDATE public.billing_subscriptions SET subscription_status='blocked',provider_revoked_at=now()");await reject();await restore();
  beforeHandler=()=>q("UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp()");await reject();assert.equal(beforeHandler,null);await restore();
  // Trigger only inside the disposable DB: invalidate evidence AFTER the
  // actual price insert, prove the final check rolls all three rows back.
  await q("CREATE FUNCTION public.fixture_expire_service_proof() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp(); RETURN NEW; END; $$; CREATE TRIGGER fixture_expire_service_proof AFTER INSERT ON public.us_service_price_amounts FOR EACH ROW EXECUTE FUNCTION public.fixture_expire_service_proof()");
  await reject();
  await q("DROP TRIGGER fixture_expire_service_proof ON public.us_service_price_amounts; DROP FUNCTION public.fixture_expire_service_proof()");
  beforeHandler=()=>q("UPDATE public.auth_sessions SET revoked_at=now()");await reject();assert.equal(beforeHandler,null);
  await q("UPDATE public.auth_sessions SET revoked_at=NULL");
  const recovered=await call(path,"POST",pending);assert.equal(recovered.status,200,JSON.stringify(recovered.body));
  assert.deepEqual(await totals(),[3,3,2]);
  assert.equal(await count("billing_subscriptions"),1);assert.equal(await count("auth_users"),1);assert.equal(await count("auth_sessions"),1);

  // Continue inside the same top-level fixture: node:test inherited beforeEach
  // would reset the parent data and conflict with the service-table FKs.
  {
   // The existing service fixture has a minimal market guard. For price
   // revision tests replace it with the actual version trigger from C11.
   const migration=await readFile(new URL("../migrations/2026_11_17__us_pay_c11_price_collector_sidecars.sql",import.meta.url),"utf8");
   const start=migration.indexOf("CREATE FUNCTION public.us_pay_c11_validate_service_price()");
   const end=migration.indexOf("CREATE FUNCTION public.us_pay_c11_validate_booking_snapshot()",start);
   assert.ok(start>=0&&end>start);
   await q("DROP TRIGGER us_pay_c11_service_price_guard ON public.us_service_price_amounts; ALTER TABLE public.us_service_price_amounts ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()");
   await q(migration.slice(start,end));
   const link=Number((await q("SELECT id FROM public.salon_master_services WHERE master_id=46 AND service_pk=$1",[servicePk])).rows[0].id);
   const pricePath="/us-service-prices/master/fixture-master/"+link;
   const desired={amount_minor:1550,expected_version:1};
   assert.equal((await call(pricePath)).status,403);
   assert.equal((await call(pricePath,"PUT",desired)).status,403);
   process.env.TOTEM_US_SHARED_MASTER_PRICE_ENABLED="true";
   process.env.TOTEM_US_SHARED_MASTER_PRICE_RELEASE_APPROVED="true";
   let p=await call(pricePath);assert.equal(p.status,200,JSON.stringify(p.body));assert.equal(p.body.amount_minor,"1250");assert.equal(p.body.price_version,1);
   assert.equal((await call("/us-service-prices/master/fixture-other-master/"+link,"PUT",desired)).status,403);
   assert.equal((await call("/us-service-prices/master/fixture-master/1","PUT",desired)).status,404);
   assert.equal((await call(pricePath,"PUT",{amount_minor:1550,expected_version:0})).status,409);
   p=await call(pricePath,"PUT",desired);assert.equal(p.status,200,JSON.stringify(p.body));assert.equal(p.body.price_version,2);assert.equal(p.body.amount_minor,"1550");
   p=await call(pricePath,"PUT",{amount_minor:1550,expected_version:2});assert.equal(p.status,200,JSON.stringify(p.body));assert.equal(p.body.price_version,2);
   const next={amount_minor:1750,expected_version:2};
   const checkPrice=async(amount,version)=>{
    const row=(await q("SELECT amount_minor::text AS amount,price_version FROM public.us_service_price_amounts WHERE salon_master_service_id=$1",[link])).rows[0];
    assert.equal(row.amount,String(amount));assert.equal(Number(row.price_version),version);
   };
   const denyPrice=async()=>{const r=await call(pricePath,"PUT",next);assert.equal(r.status,403,JSON.stringify(r.body));await checkPrice(1550,2);};
   await q("UPDATE public.billing_subscriptions SET subscription_status='blocked',provider_revoked_at=now()");await denyPrice();await restore();
   beforeHandler=()=>q("UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp()");await denyPrice();assert.equal(beforeHandler,null);await restore();
   await q("CREATE FUNCTION public.fixture_expire_price_proof() RETURNS trigger LANGUAGE plpgsql AS $price_fixture$ BEGIN UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp(); RETURN NEW; END; $price_fixture$; CREATE TRIGGER fixture_expire_price_proof AFTER UPDATE ON public.us_service_price_amounts FOR EACH ROW EXECUTE FUNCTION public.fixture_expire_price_proof()");
   await denyPrice();
   await q("DROP TRIGGER fixture_expire_price_proof ON public.us_service_price_amounts; DROP FUNCTION public.fixture_expire_price_proof()");
   beforeHandler=()=>q("UPDATE public.auth_sessions SET revoked_at=now()");await denyPrice();assert.equal(beforeHandler,null);
   await q("UPDATE public.auth_sessions SET revoked_at=NULL");
   p=await call(pricePath,"PUT",next);assert.equal(p.status,200,JSON.stringify(p.body));await checkPrice(1750,3);
   assert.deepEqual(await totals(),[3,3,2]);assert.equal(await count("billing_subscriptions"),1);
  }

  // Existing US03 DDL/triggers on disposable PG. Only the booking and
  // timezone columns used by these existing contracts are fixture inputs.
  {
   await geoReady();
   await q("CREATE TABLE public.us_timezones(name text PRIMARY KEY); INSERT INTO public.us_timezones VALUES('America/New_York'); CREATE TABLE public.bookings(id integer PRIMARY KEY,salon_id integer NOT NULL,master_id integer NOT NULL,start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,status text NOT NULL)");
   const calendarMigration=await readFile(new URL("../migrations/2026_11_14__us03_location_calendar_links.sql",import.meta.url),"utf8");
   const from=calendarMigration.indexOf("CREATE TABLE public.us_location_master_working_hours (");
   const until=calendarMigration.indexOf("DO $us03_final$",from);
   assert.ok(from>=0&&until>from);
   await q(calendarMigration.slice(from,until));
   await q("INSERT INTO public.us_salon_locations(id,salon_id,location_code,state_code,city_name,street_line1,postal_code,timezone_name,is_primary,enabled) VALUES(92,32,'second','NY','New York','101 Fixture St','10001','America/New_York',false,true)");
   const hoursPath="/masters/fixture-master/us-working-hours";
   const scoped=hoursPath+"?salon_slug=fixture-salon&location_code=main";
   assert.equal((await call(hoursPath)).status,403);
   process.env.TOTEM_US_SHARED_MASTER_HOURS_ENABLED="true";
   assert.equal((await call(hoursPath)).status,403);
   process.env.TOTEM_US_SHARED_MASTER_HOURS_RELEASE_APPROVED="true";
   let h=await call(hoursPath);assert.equal(h.status,200,JSON.stringify(h.body));
   assert.deepEqual(h.body.locations.map(x=>x.location_id),[91,92]);
   assert.equal((await call("/masters/fixture-other-master/us-working-hours")).status,403);
   assert.equal((await call(hoursPath+"?salon_slug=foreign-salon&location_code=main")).status,404);
   h=await call(scoped);assert.equal(h.status,200,JSON.stringify(h.body));assert.equal(h.body.location.timezone,"America/New_York");
   const empty=h.body.revision;
   const initial={revision:empty,hours:[{weekday:1,start_time:"09:00",end_time:"18:00",break_start:"12:00",break_end:"13:00"}]};
   h=await call(scoped,"PUT",initial);assert.equal(h.status,200,JSON.stringify(h.body));assert.equal(h.body.saved,true);
   assert.equal((await call(scoped,"PUT",initial)).status,409);
   assert.equal((await call(hoursPath+"?salon_slug=foreign-salon&location_code=main","PUT",initial)).status,404);
   const rev=h.body.revision;
   const {readUsMasterWeeklyHours}=await import("../src/services/usMasterWorkingHours.service.js");
   const unchanged=async()=>{const actual=await readUsMasterWeeklyHours(db,91,46);assert.equal(actual.revision,rev);assert.deepEqual(actual.hours,initial.hours);};
   // Future Monday at 10:00 local time, derived from DB clock, not UTC weekday.
   await q("INSERT INTO public.bookings(id,salon_id,master_id,start_at,end_at,status) SELECT 700,32,46,(date_trunc('week',clock_timestamp() AT TIME ZONE 'America/New_York')+interval '7 days 10 hours') AT TIME ZONE 'America/New_York',(date_trunc('week',clock_timestamp() AT TIME ZONE 'America/New_York')+interval '7 days 11 hours') AT TIME ZONE 'America/New_York','confirmed'; INSERT INTO public.us_booking_location_links(booking_id,location_id) VALUES(700,91)");
   const conflict=await call(scoped,"PUT",{revision:rev,hours:[]});assert.equal(conflict.status,409,JSON.stringify(conflict.body));assert.equal(conflict.body.error,"US_HOURS_FUTURE_BOOKINGS_CONFLICT");await unchanged();
   const desired={revision:rev,hours:[{...initial.hours[0],end_time:"19:00"}]};
   const denyHours=async()=>{const r=await call(scoped,"PUT",desired);assert.equal(r.status,403,JSON.stringify(r.body));await unchanged();};
   await q("UPDATE public.billing_subscriptions SET subscription_status='blocked',provider_revoked_at=now()");await denyHours();await restore();
   beforeHandler=()=>q("UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp()");await denyHours();assert.equal(beforeHandler,null);await restore();
   await q("CREATE FUNCTION public.fixture_expire_hours_proof() RETURNS trigger LANGUAGE plpgsql AS $hours_fixture$ BEGIN UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp(); RETURN NEW; END; $hours_fixture$; CREATE TRIGGER fixture_expire_hours_proof AFTER INSERT ON public.us_location_master_working_hours FOR EACH ROW EXECUTE FUNCTION public.fixture_expire_hours_proof()");
   await denyHours();
   await q("DROP TRIGGER fixture_expire_hours_proof ON public.us_location_master_working_hours; DROP FUNCTION public.fixture_expire_hours_proof()");
   beforeHandler=()=>q("UPDATE public.auth_sessions SET revoked_at=now()");await denyHours();assert.equal(beforeHandler,null);
   await q("UPDATE public.auth_sessions SET revoked_at=NULL");
   h=await call(scoped,"PUT",desired);assert.equal(h.status,200,JSON.stringify(h.body));
   assert.equal(h.body.hours[0].end_time,"19:00");assert.notEqual(h.body.revision,rev);
   assert.equal((await call(hoursPath+"?salon_slug=fixture-salon&location_code=second")).body.hours.length,0);
   assert.equal(await count("bookings"),1);assert.equal(await count("billing_subscriptions"),1);
   assert.equal(await count("auth_users"),1);assert.equal(await count("auth_sessions"),1);
  }

  // Canonical booking writer on the existing disposable authority fixture.
  // Supporting legacy tables contain only the contract columns exercised
  // here; real US03 and C11 constraints/triggers are reused.
  {
   await q(await readFile(new URL("./sql/g5-shared-master-booking-fixture.sql",import.meta.url),"utf8"));
   const migration=await readFile(new URL("../migrations/2026_11_17__us_pay_c11_price_collector_sidecars.sql",import.meta.url),"utf8");
   const snapshotStart=migration.indexOf("CREATE TABLE public.us_booking_price_snapshots (");
   const snapshotEnd=migration.indexOf("CREATE TABLE public.us_booking_payment_collectors",snapshotStart);
   const contextStart=migration.indexOf("CREATE FUNCTION public.us_pay_c11_booking_context(");
   const contextEnd=migration.indexOf("CREATE FUNCTION public.us_pay_c11_validate_service_price()",contextStart);
   const triggerStart=migration.indexOf("CREATE FUNCTION public.us_pay_c11_validate_booking_snapshot()");
   const triggerEnd=migration.indexOf("CREATE FUNCTION public.us_pay_c11_validate_collector()",triggerStart);
   assert.ok(snapshotStart>=0&&snapshotEnd>snapshotStart&&contextStart>=0&&contextEnd>contextStart&&triggerStart>=0&&triggerEnd>triggerStart);
   await q(migration.slice(snapshotStart,snapshotEnd)+migration.slice(contextStart,contextEnd)+migration.slice(triggerStart,triggerEnd));
   const link=Number((await q("SELECT id FROM public.salon_master_services WHERE master_id=46 AND service_pk=$1",[servicePk])).rows[0].id);
   const date=(await q("SELECT to_char(date_trunc('week',clock_timestamp() AT TIME ZONE 'America/New_York')+interval '7 days','YYYY-MM-DD') AS date")).rows[0].date;
   const at=async time=>(await q("SELECT ($1::date+$2::time) AT TIME ZONE 'America/New_York' AS at",[date,time])).rows[0].at.toISOString();
   const {randomUUID}=await import("node:crypto");
   const bookingPath="/masters/fixture-master/us-manual-bookings";
   const booked={salon_slug:"fixture-salon",location_code:"main",service_id:link,date,time:"14:00",start_at:await at("14:00"),
     client_payload:{name:"Synthetic Client",phone:"+12125550123"},expected_us_price_version:3,expected_us_amount_minor:"1750"};
   const book=(body=booked,key=randomUUID(),p=bookingPath)=>call(p,"POST",body,token,{"idempotency-key":key});
   const tables=["bookings","calendar_slots","clients","us_booking_location_links","us_booking_price_snapshots","client_access_tokens","client_sources","client_audit_events","api_idempotency_keys","app_notifications","notification_deliveries"];
   const bookingCounts=()=>Promise.all(tables.map(count));
   const baseline=await bookingCounts();
   assert.deepEqual(baseline,[1,0,0,1,0,0,0,0,0,0,0]);
   assert.equal((await book()).status,403);
   process.env.TOTEM_US_SHARED_MASTER_BOOKING_ENABLED="true";
   assert.equal((await book()).status,403);
   process.env.TOTEM_US_SHARED_MASTER_BOOKING_RELEASE_APPROVED="true";
   assert.equal((await book(booked,randomUUID(),"/masters/fixture-other-master/us-manual-bookings")).status,403);
   assert.equal((await book({...booked,salon_slug:"foreign-salon"})).status,404);
   assert.equal((await book({...booked,service_id:1})).status,404);
   assert.equal((await book({...booked,expected_us_price_version:2})).status,409);
   assert.equal((await book({...booked,time:"10:00",start_at:await at("10:00")})).status,409);
   assert.deepEqual(await bookingCounts(),baseline);
   const key=randomUUID();
   const created=await book(booked,key);assert.equal(created.status,201,JSON.stringify(created.body));
   assert.equal(created.body.us_service_price.amount_minor,"1750");
   assert.equal(created.body.us_service_price.service_price_version,3);
   const stored=(await q("SELECT b.master_id,b.salon_id,b.currency_code,l.location_id,p.amount_minor::text,p.service_price_version FROM public.bookings b JOIN public.us_booking_location_links l ON l.booking_id=b.id JOIN public.us_booking_price_snapshots p ON p.booking_id=b.id WHERE b.id=$1",[created.body.booking_id])).rows[0];
   assert.equal(Number(stored.master_id),46);assert.equal(Number(stored.salon_id),32);assert.equal(Number(stored.location_id),91);assert.equal(stored.currency_code,"USD");assert.equal(stored.amount_minor,"1750");assert.equal(Number(stored.service_price_version),3);
   const after=await bookingCounts();
   assert.deepEqual(after,[2,1,1,2,1,1,1,2,1,3,3]);
   const replay=await book(booked,key);assert.equal(replay.status,201,JSON.stringify(replay.body));assert.equal(replay.body.booking_id,created.body.booking_id);assert.equal(replay.body.client_cabinet.url,null);
   assert.equal((await book(booked)).status,409);
   assert.deepEqual(await bookingCounts(),after);
   const pending={...booked,time:"16:00",start_at:await at("16:00"),client_payload:{name:"Synthetic Rollback",phone:"+12125550124"}};
   const denyBooking=async()=>{const r=await book(pending);assert.equal(r.status,403,JSON.stringify(r.body));assert.deepEqual(await bookingCounts(),after);};
   beforeHandler=()=>q("UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp()");await denyBooking();assert.equal(beforeHandler,null);await restore();
   await q("CREATE FUNCTION public.fixture_expire_booking_proof() RETURNS trigger LANGUAGE plpgsql AS $booking_fixture$ BEGIN UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp(); RETURN NEW; END; $booking_fixture$; CREATE TRIGGER fixture_expire_booking_proof AFTER INSERT ON public.us_booking_price_snapshots FOR EACH ROW EXECUTE FUNCTION public.fixture_expire_booking_proof()");
   await denyBooking();
   await q("DROP TRIGGER fixture_expire_booking_proof ON public.us_booking_price_snapshots; DROP FUNCTION public.fixture_expire_booking_proof()");
   beforeHandler=()=>q("UPDATE public.auth_sessions SET revoked_at=now()");await denyBooking();assert.equal(beforeHandler,null);
   await q("UPDATE public.auth_sessions SET revoked_at=NULL");
   // Actual verified-revocation writer, not a second entitlement or role token.
   // The synthetic fixture supplies the already-verified evidence input.
   const {revokeUsSaasProjection}=await import("../src/services/billing/usSaasEntitlementProjection.js");
   const c=await db.connect();
   try{await c.query("BEGIN");const row=(await c.query("SELECT * FROM public.owner_opening_requests WHERE id=1 FOR UPDATE")).rows[0];
    assert.equal(await revokeUsSaasProjection(c,row,{reason:"ODOO_INVOICE_REVERSED",verifiedAtUtc:new Date().toISOString()}),true);await c.query("COMMIT");
   }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
   await denyBooking();assert.equal((await book(booked,key)).status,403);
   assert.equal((await call("/masters/fixture-master")).status,403);
   assert.equal((await call("/us-service-links/master/fixture-master/options")).status,403);
   assert.equal((await call("/us-service-prices/master/fixture-master/"+link)).status,403);
   assert.equal((await call("/masters/fixture-master/us-working-hours")).status,403);
   assert.equal((await call("/us-service-links/salon/fixture-salon","POST",{operation:"create",master_id:46,name:"Denied after revoke",duration_min:30,amount_minor:500},salonToken)).status,403);
   await q("UPDATE public.billing_subscriptions SET blocked_at=NULL");await restore();
   const recovered=await book(pending);assert.equal(recovered.status,201,JSON.stringify(recovered.body));
   assert.deepEqual(await bookingCounts(),[3,2,2,3,2,2,2,4,2,6,6]);
   const directPrice=()=>call("/us-service-prices/salon/fixture-salon/"+link,"PUT",{amount_minor:1850,expected_version:3},salonToken);
   const directLink=()=>call("/us-service-links/salon/fixture-salon","POST",{operation:"create",master_id:46,name:"Salon role rollback fixture",duration_min:30,amount_minor:500},salonToken);
   const previousTotals=await totals();
   const checkDirectPrice=async()=>{const r=(await q("SELECT amount_minor::text,price_version FROM public.us_service_price_amounts WHERE salon_master_service_id=$1",[link])).rows[0];assert.equal(r.amount_minor,"1750");assert.equal(Number(r.price_version),3);};
   beforeHandler=()=>q("UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp()");
   let denied=await directPrice();assert.equal(denied.status,403,JSON.stringify(denied.body));assert.equal(beforeHandler,null);await checkDirectPrice();await restore();
   await q("CREATE FUNCTION public.fixture_direct_price_expire() RETURNS trigger LANGUAGE plpgsql AS $direct_price$ BEGIN UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp(); RETURN NEW; END; $direct_price$; CREATE TRIGGER fixture_direct_price_expire AFTER UPDATE ON public.us_service_price_amounts FOR EACH ROW EXECUTE FUNCTION public.fixture_direct_price_expire()");
   denied=await directPrice();assert.equal(denied.status,403,JSON.stringify(denied.body));await checkDirectPrice();
   await q("DROP TRIGGER fixture_direct_price_expire ON public.us_service_price_amounts; DROP FUNCTION public.fixture_direct_price_expire()");
   beforeHandler=()=>q("UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp()");
   denied=await directLink();assert.equal(denied.status,403,JSON.stringify(denied.body));assert.equal(beforeHandler,null);assert.deepEqual(await totals(),previousTotals);await restore();
   await q("CREATE FUNCTION public.fixture_direct_link_expire() RETURNS trigger LANGUAGE plpgsql AS $direct_link$ BEGIN UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp(); RETURN NEW; END; $direct_link$; CREATE TRIGGER fixture_direct_link_expire AFTER INSERT ON public.us_service_price_amounts FOR EACH ROW EXECUTE FUNCTION public.fixture_direct_link_expire()");
   denied=await directLink();assert.equal(denied.status,403,JSON.stringify(denied.body));assert.deepEqual(await totals(),previousTotals);
   await q("DROP TRIGGER fixture_direct_link_expire ON public.us_service_price_amounts; DROP FUNCTION public.fixture_direct_link_expire()");
   const publicBody={master_id:46,location_code:"main",service_id:link,date,time:"17:30",start_at:await at("17:30"),
     client_payload:{name:"Synthetic Public",phone:"+12125550125"},expected_us_price_version:3,expected_us_amount_minor:"1750"};
   const publicKey=randomUUID();
   const publicBook=async(key=publicKey)=>{
     const r=await fetch("http://127.0.0.1:"+server.address().port+"/fixture-public/fixture-salon/bookings",{method:"POST",headers:{"Content-Type":"application/json","idempotency-key":key},body:JSON.stringify(publicBody)});
     return {status:r.status,body:await r.json()};
   };
   const beforePublic=await bookingCounts();
   await q("UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp()");
   denied=await publicBook();assert.equal(denied.status,403,JSON.stringify(denied.body));assert.deepEqual(await bookingCounts(),beforePublic);await restore();
   await q("CREATE FUNCTION public.fixture_public_expire() RETURNS trigger LANGUAGE plpgsql AS $public_fixture$ BEGIN UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp(); RETURN NEW; END; $public_fixture$; CREATE TRIGGER fixture_public_expire AFTER INSERT ON public.us_booking_price_snapshots FOR EACH ROW EXECUTE FUNCTION public.fixture_public_expire()");
   denied=await publicBook();assert.equal(denied.status,403,JSON.stringify(denied.body));assert.deepEqual(await bookingCounts(),beforePublic);
   await q("DROP TRIGGER fixture_public_expire ON public.us_booking_price_snapshots; DROP FUNCTION public.fixture_public_expire()");
   const published=await publicBook();assert.equal(published.status,201,JSON.stringify(published.body));
   assert.deepEqual(await bookingCounts(),[4,3,3,4,3,3,3,6,3,9,9]);
   await q("UPDATE public.billing_subscriptions SET provider_revoked_at=now(),subscription_status='blocked'");
   denied=await publicBook();assert.equal(denied.status,403,JSON.stringify(denied.body));
   denied=await directPrice();assert.equal(denied.status,403,JSON.stringify(denied.body));await checkDirectPrice();
   await restore();
   const directSaved=await directPrice();assert.equal(directSaved.status,200,JSON.stringify(directSaved.body));assert.equal(directSaved.body.price_version,4);
   const directCreated=await directLink();assert.equal(directCreated.status,200,JSON.stringify(directCreated.body));

   // Existing C11 and TAX production DDL only, applied to disposable fixture.
   const collectorStart=migration.indexOf("CREATE TABLE public.us_booking_payment_collectors (");
   const collectorEnd=migration.indexOf("CREATE FUNCTION public.us_pay_c11_booking_context(",collectorStart);
   const collectorTrigger=migration.indexOf("CREATE FUNCTION public.us_pay_c11_validate_collector()");
   assert.ok(collectorStart>=0&&collectorEnd>collectorStart&&collectorTrigger>collectorEnd);
   await q(migration.slice(collectorStart,collectorEnd)+migration.slice(collectorTrigger,migration.lastIndexOf("COMMIT;")));
   await q(await readFile(new URL("../migrations/2026_11_17__us_pay_c11_collector_selection_audit.sql",import.meta.url),"utf8"));
   await q(await readFile(new URL("../migrations/2026_11_17__us_service_tax_mvp.sql",import.meta.url),"utf8"));
   const collectorPath="/us-pay-c11/bookings/"+created.body.booking_id+"/collector";
   const taxPath="/us-service-tax/salon/fixture-salon";
   const quotePath="/us-pay-c11/bookings/"+created.body.booking_id+"/service-tax-quote";
   const choose=()=>call(collectorPath,"PUT",{collector_owner_type:"salon",expected_revision:0},salonToken);
   const saveTax=()=>call(taxPath,"PUT",{rate_bps:800,expected_revision:0},salonToken);
   assert.equal((await call(collectorPath,"PUT",{collector_owner_type:"master",expected_revision:0})).status,403);
   assert.equal((await call("/us-service-tax/master/fixture-master","PUT",{rate_bps:800,expected_revision:0})).status,403);
   const profile=await call("/masters/fixture-master");assert.equal(profile.status,200,JSON.stringify(profile.body));assert.equal(profile.body.billing_access.shared_operations.finance,false);assert.equal(profile.body.billing_access.can_write,false);assert.equal(profile.body.billing_access.can_withdraw,false);
   assert.equal((await call("/salons/fixture-salon/money-core/withdraw-requests","POST",{},salonToken)).status,409);
   beforeHandler=()=>q("UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp()");
   denied=await choose();assert.equal(denied.status,403,JSON.stringify(denied.body));assert.equal(await count("us_booking_payment_collectors"),0);await restore();
   const expireTrigger=async(table,operation,action)=>{
     const suffix="fixture_finance_expire";
     await q("CREATE FUNCTION public."+suffix+"() RETURNS trigger LANGUAGE plpgsql AS $finance_fixture$ BEGIN UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp(); RETURN NEW; END; $finance_fixture$; CREATE TRIGGER "+suffix+" AFTER "+operation+" ON public."+table+" FOR EACH ROW EXECUTE FUNCTION public."+suffix+"()");
     try{const result=await action();assert.equal(result.status,403,JSON.stringify(result.body));}
     finally{await q("DROP TRIGGER "+suffix+" ON public."+table+"; DROP FUNCTION public."+suffix+"()");}
   };
   await expireTrigger("us_booking_payment_collectors","INSERT",choose);
   assert.equal(await count("us_booking_payment_collectors"),0);assert.equal(await count("us_booking_collector_selection_events"),0);
   const chosen=await choose();assert.equal(chosen.status,201,JSON.stringify(chosen.body));assert.equal(chosen.body.collector.verification_status,"pending");assert.equal(chosen.body.payment_ready,false);
   await expireTrigger("us_owner_service_tax_settings","INSERT",saveTax);
   assert.equal(await count("us_owner_service_tax_settings"),0);
   const savedTax=await saveTax();assert.equal(savedTax.status,200,JSON.stringify(savedTax.body));
   // Simulated already-verified merchant receipt only in isolated DB. Never
   // promotes a real collector or initiates an actual Stripe operation.
   const rev=Number((await q("UPDATE public.us_booking_payment_collectors SET verification_status='verified',verified_at=now() WHERE booking_id=$1 RETURNING revision",[created.body.booking_id])).rows[0].revision);
   const makeQuote=()=>call(quotePath,"POST",{expected_collector_revision:rev,expected_tax_setting_revision:1},salonToken);
   await expireTrigger("us_booking_service_tax_snapshots","INSERT",makeQuote);
   assert.equal(await count("us_booking_service_tax_snapshots"),0);
   const made=await makeQuote();assert.equal(made.status,201,JSON.stringify(made.body));assert.equal(made.body.quote.service_base_minor,"1750");assert.equal(made.body.quote.service_tax_minor,"140");assert.equal(made.body.quote.charge_total_minor,"1890");assert.equal(made.body.payment_ready,false);
   // Real reconciliation logic consumes synthetic definitive provider evidence.
   const {reconcileUsSaasOpening}=await import("../src/services/billing/usSaasReconciliation.js");
   const revoked=await reconcileUsSaasOpening({pool:db,requestId:1,readback:async()=>({status:"WAIT",reason:"ODOO_INVOICE_REVERSED"}),writeAudit:async(client,{request,eventType,data})=>{
    return (await client.query("INSERT INTO public.audit_events(event_type,actor,core_user_id,data) VALUES($1,'fixture-reconcile',0,$2::jsonb) RETURNING id",[eventType,JSON.stringify(data)])).rows[0];
   }});
   assert.equal(revoked.status,"REVOKED",JSON.stringify(revoked));
   assert.equal((await call("/masters/fixture-master")).status,403);
   assert.equal((await call("/masters/fixture-master/services")).status,403);
   assert.equal((await call(collectorPath,"PUT",{collector_owner_type:"salon",expected_revision:rev},salonToken)).status,403);
   assert.equal((await saveTax()).status,403);assert.equal((await makeQuote()).status,403);
   assert.deepEqual(await listUsOwnSalonRoleOptions(db,{auth:{...auth,session_id:sessionId},env}),[]);
   assert.equal((await publicBook()).status,403);
   assert.equal(await count("us_booking_collector_selection_events"),1);assert.equal(await count("us_booking_service_tax_snapshots"),1);
   const {classifyUsSaasInternalWrite,buildUsSaasCommercialGuard:buildGuard}=await import("../src/middleware/usSaasCommercialGuard.js");
   const refund="/us-pay-c11/live-connect/salon/32/bookings/"+created.body.booking_id+"/refund";
   assert.equal(classifyUsSaasInternalWrite(refund,"POST").action,"CUSTOMER_REFUND");
   let forwarded=false;
   await buildGuard(db)({path:refund,method:"POST",auth:{...auth,session_id:sessionId}},{status(){throw Error("REFUND_GUARD_MUST_NOT_BLOCK_EXISTING_OBLIGATION");}},()=>{forwarded=true;});
   assert.equal(forwarded,true);
   await q("UPDATE public.billing_subscriptions SET blocked_at=NULL");await restore();
   assert.equal(await count("billing_subscriptions"),1);assert.equal(await count("auth_users"),1);assert.equal(await count("auth_sessions"),1);
   if(process.env.G5_SHARED_SDK_BROWSER==="YES"){
    const {runSharedSdkBrowser}=await import("./fixtures/g5-shared-sdk-browser.mjs");
    await runSharedSdkBrowser({base:"http://127.0.0.1:"+server.address().port,
      salonToken,password,sessionId,link,date,startAt:await at("09:00"),
      revoke:async()=>q("UPDATE public.billing_subscriptions SET provider_revoked_at=now(),subscription_status='blocked'"),
      restore:async()=>{await q("UPDATE public.billing_subscriptions SET blocked_at=NULL");await restore();},q});
    assert.equal(await count("billing_subscriptions"),1);assert.equal(await count("auth_users"),1);assert.equal(await count("auth_sessions"),1);
   }
  }
 }finally{
  await new Promise(resolve=>server.close(resolve));
  for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
 }
});
