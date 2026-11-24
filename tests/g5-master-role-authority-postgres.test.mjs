import test,{before,beforeEach,after} from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
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
});
beforeEach(async()=>{
 await q("TRUNCATE public.owner_opening_requests,public.audit_events,public.auth_users,public.auth_sessions,public.owner_salon,public.salons,public.masters,public.master_salon,public.markets,public.tenant_market_settings,public.billing_subscriptions RESTART IDENTITY");
 await q(`INSERT INTO public.markets(id,code,country_code,default_locale,supported_locales,default_currency,supported_currencies,default_timezone,country_pack_code,country_pack_version,active)
 VALUES(4,'US','US','en',ARRAY['en'],'USD',ARRAY['USD'],'America/New_York','US','1',true);
 INSERT INTO public.salons(id,slug,name,status,enabled) VALUES(32,'fixture-salon','Fixture','active',true);
 INSERT INTO public.auth_users(id,email,role,salon_slug,salon_id,phone,enabled) VALUES(100,'fixture-owner@example.invalid','salon_admin','fixture-salon','32','+12125550123',true);
 INSERT INTO public.auth_sessions(id,user_id,expires_at,last_seen_at) VALUES('fixture-owner-session',100,now()+interval '1 hour',now());
 INSERT INTO public.owner_salon(id,owner_id,salon_id,status) VALUES(1,'100',32,'active');
 INSERT INTO public.tenant_market_settings(salon_id,market_id) VALUES(32,4);`);
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
const decide=(decision,extra={})=>decideUsExistingSalonConsent({pool:db,requestId:2,auth,decision,env,...extra});
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
