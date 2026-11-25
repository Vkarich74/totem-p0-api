// Delta tests: real disposable PG17, no external payment/identity providers.
import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import pg from "pg";
import {runQueueBatchWorker} from "../jobs/queueWorker.js";
import {enqueueJob} from "../utils/enqueueJob.js";
import {runUsSaasReconciliationTick} from "../jobs/usSaasReconciliationTick.js";
import {runUsSaasRuntimeOnce} from "../src/services/billing/usSaasRuntime.js";
import {reconcileUsSaasOpeningFromQueue} from "../src/services/billing/usSaasReconciliation.js";
import {writeSystemUsSaasReconciliationAudit,US_SAAS_SYSTEM_ACTOR} from "../src/services/billing/usSaasReconciliationAudit.js";
import {startLiveSellerOnboarding,getLiveSellerConnection} from "../src/services/usPayC11LiveSellerOnboarding.service.js";
import {beginExistingUsStripeOAuth,finishExistingUsStripeOAuth} from "../src/services/usPayC11LiveExistingOAuth.service.js";
const raw=process.env.G5_TEST_DATABASE_URL;
if(process.env.C6_DELTA_ISOLATED!=="YES"||process.env.DATABASE_URL||!raw)throw Error("ISOLATED_ONLY");
const url=new URL(raw);
assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,"55432");assert.equal(url.pathname,"/c6_delta");
const pool=new pg.Pool({connectionString:raw,max:12,statement_timeout:10000});
const q=(s,a)=>pool.query(s,a),scalar=async(s,a)=>Number((await q(s,a)).rows[0].n);
const type="us_saas_reconcile",sid="11111111-1111-4111-8111-000000000011",admin={source:"session",role:"salon_admin",user_id:11,session_id:sid};
const no=()=>{throw Error("UNEXPECTED_PROVIDER_IO")};
const tx=async fn=>{const c=await pool.connect();try{await c.query("BEGIN");const r=await fn(c);await c.query("COMMIT");return r;}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}};
const job=async key=>enqueueJob({job_type:type,payload:{request_id:"1001"},idempotency_key:key,max_attempts:2,dbClient:pool});
const worker=handler=>runQueueBatchWorker({db:pool,jobType:type,limit:1,leaseMs:60000,handler});
const readJob=async id=>(await q("SELECT * FROM public.async_jobs WHERE id=$1",[id])).rows[0];
let binding;
before(async()=>{
 assert.equal((await q("SELECT current_database() AS n")).rows[0].n,"c6_delta");
 assert.equal(Math.floor(Number((await q("SHOW server_version_num")).rows[0].server_version_num)/10000),17);
 await q("INSERT INTO public.markets(id,code,country_code,default_locale,supported_locales,default_currency,supported_currencies,default_timezone,country_pack_code,country_pack_version,active) VALUES(1,'KG','KG','ru-KG',ARRAY['ru-KG'],'KGS',ARRAY['KGS'],'Asia/Bishkek','KG','1',true),(2,'US','US','en-US',ARRAY['en-US'],'USD',ARRAY['USD'],'America/Los_Angeles','US','1',true)");
 await q("INSERT INTO public.salons(id,slug,name,enabled,status) VALUES(101,'ci-us','CI US',true,'active'),(102,'ci-kg','CI KG',true,'active')");
 await q("INSERT INTO public.auth_users(id,email,role,salon_slug,master_slug,enabled,must_set_password) VALUES(11,'salon@example.invalid','salon_admin','ci-us',NULL,true,false),(12,'kg@example.invalid','salon_admin','ci-kg',NULL,true,false)");
 await q("INSERT INTO public.auth_sessions(id,user_id,expires_at,last_seen_at) VALUES($1,11,clock_timestamp()+interval '1 hour',clock_timestamp())",[sid]);
 await q("INSERT INTO public.owner_salon(id,owner_id,salon_id,status) VALUES(1,'11',101,'active'),(2,'12',102,'active')");
 await q("INSERT INTO public.tenant_market_settings(salon_id,market_id) VALUES(101,2),(102,1)");
 await q("INSERT INTO public.owner_opening_requests(id,owner_type,status,name,email,slug_final,created_owner_id,created_auth_user_id,source_namespace,source_company_id,source_website_id,source_partner_id,source_request_id,precheck_result_json) VALUES(1001,'salon','activated','CI Fixture','salon@example.invalid','ci-us',101,11,'odoo_online',4,5,201,'odoo-us-partner-201','{\"normalized\":{\"market_code\":\"US\"}}')");
});
after(async()=>pool.end());
test("hard runtime HOLD cannot be overridden by all env flags; zero DB/provider IO",async()=>{
 const env=Object.fromEntries(["RUNTIME_ENABLED","RUNTIME_RELEASE_APPROVED","RECONCILIATION_ENABLED","BATCH_READBACK_ENABLED","ACTIVATION_ENABLED","ACCESS_ENABLED"].map(x=>["TOTEM_US_ODOO_SAAS_"+x,"true"]));
 const db={query:no,connect:no};
 assert.equal((await runUsSaasRuntimeOnce({db,env,fetchImpl:no})).status,"HOLD");
 assert.equal((await runUsSaasReconciliationTick({db,env})).status,"HOLD");
 await assert.rejects(()=>reconcileUsSaasOpeningFromQueue({pool:db,env}),e=>e.code==="US_SAAS_PROJECTION_RELEASE_HOLD");
});
test("real partial unique arbiter: 12 simultaneous enqueues yield exactly one job",async()=>{
 const a=await Promise.all(Array.from({length:12},()=>job("ci-idempotent")));
 assert.equal(a.filter(x=>x.enqueued).length,1);
 assert.equal(await scalar("SELECT count(*) AS n FROM public.async_jobs WHERE idempotency_key='ci-idempotent'"),1);
});
test("claim committed before handler; competing worker cannot claim; SQL lease fence",async()=>{
 let entered,release;
 const ready=new Promise(r=>entered=r),resume=new Promise(r=>release=r);
 const first=worker(async items=>{
  assert.equal(items.length,1);const active=(await q("SELECT * FROM public.async_jobs WHERE idempotency_key='ci-idempotent'")).rows[0];
  assert.equal(active.status,"processing");assert.ok(active.lease_token);
  entered();await resume;
  await tx(db=>items[0].assertLease(db));return [null];
 });
 try{await ready;const second=await worker(no);assert.equal(second.claimed,0);}
 finally{release();}
 const r=await first;assert.equal(r.done,1);
});
test("expired old lease cannot commit or acknowledge after new worker claims",async()=>{
 const j=await job("ci-stale");
 let entered,release;
 const ready=new Promise(r=>entered=r),resume=new Promise(r=>release=r);
 const first=worker(async items=>{
  entered();await resume;
  await assert.rejects(()=>tx(db=>items[0].assertLease(db)),/LEASE_LOST/);
  return [null];
 });
 try{
  await ready;
  await q("UPDATE public.async_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[j.job_id]);
  const next=await worker(async items=>{await tx(db=>items[0].assertLease(db));return [null]});
  assert.equal(next.done,1);
 }finally{release();}
 assert.equal((await first).lost_lease,1);
 const final=await readJob(j.job_id);assert.equal(final.status,"done");assert.equal(final.attempts,2);
});
test("heartbeat extends real lease, failure codes sanitized, retry and exhaustion",async()=>{
 const j=await job("ci-retry");
 const r=await runQueueBatchWorker({db:pool,jobType:type,limit:1,leaseMs:1500,handler:async items=>{
  const start=new Date((await readJob(j.job_id)).lease_until).getTime();
  await delay(800);
  assert.ok(new Date((await readJob(j.job_id)).lease_until).getTime()>start);
  return [Object.assign(Error("private details not stored"),{code:"CI_RETRY"})];
 }});
 assert.equal(r.retried,1);
 const saved=await readJob(j.job_id);assert.equal(saved.status,"pending");assert.equal(saved.last_error,"CI_RETRY");assert.equal(saved.lease_token,null);
 await q("UPDATE public.async_jobs SET run_at=(now() AT TIME ZONE 'UTC')-interval '1 second' WHERE id=$1",[j.job_id]);
 const r2=await worker(async()=>[Error("private details not stored")]);assert.equal(r2.failed,1);assert.equal((await readJob(j.job_id)).last_error,"ASYNC_JOB_HANDLER_FAILED");
});
test("system audit in same real transaction; invalid principal and rollback",async()=>{
 const req=(await q("SELECT * FROM public.owner_opening_requests WHERE id=1001")).rows[0];
 const data={billing_id:6,subscription_order_id:7,invoice_id:8,effective_until:new Date().toISOString(),commercial_policy_version:"ci"};
 const args={request:req,admin:US_SAAS_SYSTEM_ACTOR,eventType:"owner_opening.odoo_paid_entitlement_reconciled",data};
 await assert.rejects(()=>tx(async db=>{await writeSystemUsSaasReconciliationAudit(db,args);throw Error("CI_ROLLBACK");}),/CI_ROLLBACK/);
 assert.equal(await scalar("SELECT count(*) AS n FROM public.audit_events"),0);
 await assert.rejects(()=>tx(db=>writeSystemUsSaasReconciliationAudit(db,{...args,admin:{id:11}})),/SYSTEM_AUDIT_CONTRACT_INVALID/);
 await tx(db=>writeSystemUsSaasReconciliationAudit(db,args));
 const r=(await q("SELECT * FROM public.audit_events")).rows[0];assert.equal(r.actor,"system:us_saas_reconciliation");assert.equal(r.core_user_id,null);
});
const opts={auth:admin,ownerType:"salon",ownerId:101,consent:true,secretKey:"sk_live_ci_only",clientId:"ca_SYNTHETIC123",fetchImpl:no};
test("actual seller Onboarding and OAuth initiation deny under HOLD, no consent/binding/provider write",async()=>{
 assert.equal((await getLiveSellerConnection(pool,opts)).status,200);
 for(const res of [await startLiveSellerOnboarding(pool,opts),await beginExistingUsStripeOAuth(pool,opts)]){
  assert.equal(res.status,403);assert.equal(res.body.error,"US_SAAS_COMMERCIAL_ACCESS_DENIED");
 }
 assert.equal(await scalar("SELECT count(*) AS n FROM public.us_stripe_live_seller_bindings"),0);
 assert.equal(await scalar("SELECT count(*) AS n FROM public.us_stripe_live_seller_events"),0);
});
test("pending callback cannot exchange after HOLD; state consumed once, no provider IO",async()=>{
 binding=(await q("INSERT INTO public.us_stripe_live_seller_bindings(market_id,owner_type,owner_id,created_by_user_id,provisioning_token) VALUES(2,'salon',101,11,$1) RETURNING id",[randomUUID()])).rows[0].id;
 const state="a".repeat(43),hash=createHash("sha256").update(state).digest("hex");
 await q("INSERT INTO public.us_stripe_live_oauth_attempts(state_hash,binding_id,actor_user_id,session_id,owner_type,owner_id,market_id,owner_slug,expires_at) VALUES($1,$2,11,$3,'salon',101,2,'ci-us',now()+interval '10 minutes')",[hash,binding,sid]);
 const args={...opts,state,code:"ac_SYNTHETIC123"};
 assert.equal((await finishExistingUsStripeOAuth(pool,args)).result,"invalid_or_expired_state");
 assert.equal((await finishExistingUsStripeOAuth(pool,args)).result,"invalid_or_expired_state");
 const r=(await q("SELECT result,consumed_at,stripe_account_id FROM public.us_stripe_live_oauth_attempts WHERE state_hash=$1",[hash])).rows[0];
 assert.equal(r.result,"invalidated");assert.ok(r.consumed_at);assert.equal(r.stripe_account_id,null);
 assert.equal(await scalar("SELECT count(*) AS n FROM public.us_stripe_live_seller_events"),0);
});
