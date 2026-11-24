import test,{before,beforeEach,after} from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {switchUsOwnSalonRole,resolveUsOwnSalonRoleContext,isUsRoleContextRouteAllowed} from "../src/auth/usOwnSalonRoleContext.js";
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
 await q("TRUNCATE public.owner_opening_requests,public.audit_events,public.auth_users,public.auth_sessions,public.owner_salon,public.salons,public.masters,public.master_salon,public.markets,public.tenant_market_settings,public.billing_subscriptions,public.onboarding_state_transitions RESTART IDENTITY");
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
