// Isolated PostgreSQL only. No real Odoo traffic and no production credentials.
import test,{before,beforeEach,after} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import pg from "pg";
import {runUsSaasRuntimeOnce} from "../src/services/billing/usSaasRuntime.js";
import {readUsSaasRuntimeHealth,readUsSaasRuntimeWatchdog} from "../src/services/billing/usSaasRuntimeMonitoring.js";
import {runUsSaasReconciliationTick} from "../jobs/usSaasReconciliationTick.js";
import {fixtureData,fixtureEnv,fixtureTransport} from "./fixtures/g5-odoo-batch-fixture.mjs";
const conn=process.env.G5_TEST_DATABASE_URL;
if(!conn||process.env.G5_T6G_ISOLATED!=="YES"||process.env.DATABASE_URL)throw Error("G5_T6G_ISOLATED_REQUIRED");
const url=new URL(conn);
if(url.hostname!=="127.0.0.1"||url.pathname!=="/g5_t6g_test")throw Error("G5_T6G_REFUSES_NONLOCAL");
const db=new pg.Pool({connectionString:conn,max:12,connectionTimeoutMillis:5000,statement_timeout:15000,
 options:"-c timezone=UTC -c datestyle=ISO,YMD"});
const q=(s,a)=>db.query(s,a);
const count=async(s,a)=>Number((await q(s,a)).rows[0].n);
const runtimeEnv=()=>({...fixtureEnv(),TOTEM_US_ODOO_URL:"https://totem-platform.odoo.com",TOTEM_US_ODOO_DB:"totem-platform",
 TOTEM_US_ODOO_SAAS_RUNTIME_ENABLED:"true",TOTEM_US_ODOO_SAAS_RUNTIME_RELEASE_APPROVED:"true"});
const state=async()=> (await q("SELECT * FROM public.us_saas_runtime_control WHERE singleton")).rows[0];
const noLog=()=>{};
before(async()=>{
 const r=await q("SELECT current_database() AS db,version() AS version");
 assert.equal(r.rows[0].db,"g5_t6g_test");assert.match(r.rows[0].version,/PostgreSQL 17\./);
 assert.equal(await count("SELECT count(*) AS n FROM pg_tables WHERE schemaname='public'"),0);
 await q(await readFile(new URL("./sql/g5-t6d-prod-schema-fixture.sql",import.meta.url),"utf8"));
 for(const name of ["g5_async_jobs_lease_v2.sql","g5_us_odoo_source_identity_v1.sql","g5_us_odoo_billing_projection_v1.sql","g5_us_saas_runtime_control_v1.sql"])
  await q(await readFile(new URL("../migrations/"+name,import.meta.url),"utf8"));
 console.log("G5_T6G_SCHEMA",r.rows[0].version,"4 migrations isolated");
});
beforeEach(async()=>{
 await q("TRUNCATE public.async_jobs,public.audit_events,public.billing_subscriptions,public.owner_opening_requests RESTART IDENTITY");
 await q("UPDATE public.us_saas_runtime_control SET not_before='-infinity',consecutive_failures=0,last_started_at=NULL,last_finished_at=NULL,last_heartbeat_at=NULL,last_outcome='NEVER',last_metrics='{}'");
});
after(async()=>db.end());
async function seed(n){
 await q(`INSERT INTO public.owner_opening_requests
 (id,owner_type,status,name,email,created_owner_id,created_auth_user_id,precheck_result_json,
 source_namespace,source_company_id,source_website_id,source_partner_id,source_request_id)
 SELECT i,'salon','activated','fixture','fixture@example.invalid',i,i+10000,'{"market_code":"US"}',
 'odoo_online',4,5,i+20000,'fixture-'||i FROM generate_series(1,$1::int) i`,[n]);
 await q(`INSERT INTO public.billing_subscriptions
 (owner_type,owner_id,amount,currency,wallet_only,current_period_start,current_period_end,grace_period_days,
 provider_namespace,provider_company_id,provider_website_id,provider_partner_id,provider_source_request_id,
 provider_subscription_order_id,provider_invoice_id,provider_policy_version,provider_verified_at)
 SELECT 'salon',i,0,'USD',false,clock_timestamp()-interval '1 day',clock_timestamp()+interval '30 days',0,
 'odoo_online',4,5,i+20000,'fixture-'||i,i+30000,i+40000,'qa_v1',
 clock_timestamp()-interval '65 seconds' FROM generate_series(1,$1::int) i`,[n]);
 await q("INSERT INTO public.billing_subscriptions(owner_type,owner_id,amount,currency) VALUES('salon',999999,10,'KGS')");
}
function provider(n,change={}){
 const f=fixtureData(n),t=fixtureTransport(f.data,change);
 return {metrics:t.metrics,fetchImpl:(url,options)=>{
  assert.equal(url.origin,"https://totem-platform.odoo.com");
  return t.fetchImpl(new URL("https://fixture.invalid/jsonrpc"),options);
 }};
}
function run(fetchImpl,extra={}){return runUsSaasRuntimeOnce({db,env:runtimeEnv(),fetchImpl,logger:noLog,tick:runUsSaasReconciliationTick,...extra});}
test("HOLD leaves persistent control, queue and projections untouched",async()=>{
 await seed(2);const old=await state();
 assert.deepEqual(await run(()=>{throw Error("NETWORK");},{env:{}}),{status:"HOLD"});
 assert.deepEqual(await state(),old);assert.equal(await count("SELECT count(*) AS n FROM public.async_jobs"),0);
});
test("real PG: enabled fixture only, exact batch and audit, runtime metrics persisted",async()=>{
 await seed(50);const t=provider(50);
 const r=await run(t.fetchImpl),s=await state();
 assert.equal(r.status,"RAN");assert.equal(r.workers[0].done,50);assert.equal(s.last_outcome,"OK");
 assert.equal(s.last_metrics.paid,50);assert.equal(s.last_metrics.rpc,11);
 assert.equal(t.metrics.auth,1);assert.equal(t.metrics.reads,10);assert.ok(s.last_metrics.peak<=4);
 assert.equal(await count("SELECT count(*) AS n FROM public.audit_events"),50);
 assert.equal(await count("SELECT count(*) AS n FROM public.billing_subscriptions WHERE owner_id=999999 AND wallet_only AND provider_namespace IS NULL"),1);
 assert.equal(r.health.total,50);assert.equal(r.health.stale,0);
 console.log("G5_T6G_RUNTIME",JSON.stringify({owners:50,metrics:s.last_metrics,health:r.health}));
});
test("monitor distinguishes stale, missing, future, orphan, expired and queue health; excludes KG",async()=>{
 await seed(6);
 await q("UPDATE public.billing_subscriptions SET provider_verified_at=clock_timestamp()-interval '301 seconds' WHERE owner_id=1");
 await q("UPDATE public.billing_subscriptions SET provider_verified_at=clock_timestamp()-interval '250 seconds' WHERE owner_id=2");
 // The real migration disallows NULL for Odoo rows. Verify this, rather than
 // disabling the production constraint to fabricate a state.
 await assert.rejects(()=>q("UPDATE public.billing_subscriptions SET provider_verified_at=NULL WHERE owner_id=3"),e=>e.code==="23514");
 await q("UPDATE public.billing_subscriptions SET provider_verified_at=clock_timestamp()+interval '2 seconds' WHERE owner_id=4");
 await q("DELETE FROM public.owner_opening_requests WHERE id=5");
 await q("UPDATE public.billing_subscriptions SET current_period_end=clock_timestamp()-interval '1 second' WHERE owner_id=6");
 await q(`INSERT INTO public.async_jobs(job_type,payload,status,run_at,attempts,max_attempts,lease_until)
 VALUES('us_saas_reconcile','{"request_id":"1"}','pending',(clock_timestamp() AT TIME ZONE 'UTC')-interval '75 seconds',0,2,NULL),
 ('us_saas_reconcile','{"request_id":"2"}','processing',clock_timestamp() AT TIME ZONE 'UTC',1,2,clock_timestamp()-interval '1 second'),
 ('us_saas_reconcile','{"request_id":"3"}','failed',clock_timestamp() AT TIME ZONE 'UTC',2,2,NULL),
 ('example_log','{}','pending',clock_timestamp() AT TIME ZONE 'UTC',0,2,NULL)`);
 const h=await readUsSaasRuntimeHealth(db);
 assert.equal(h.total,6);assert.equal(h.orphaned,1);assert.equal(h.at_risk,3);assert.equal(h.stale,2);
 assert.equal(h.expired_active,1);assert.equal(h.pending,1);assert.equal(h.runnable,1);assert.equal(h.lease_expired,1);
 assert.equal(h.recent_failed,1);assert.equal(h.severity,"CRITICAL");assert.ok(h.oldest_runnable_s>=75);
 assert.ok(!JSON.stringify(h).includes("fixture-"));
});
test("429 persists global cooldown; another replica does not send calls; recovery reuses leased queue",async()=>{
 await seed(3);let calls=0;
 const rate=await run(async()=>{calls++;return {ok:false,status:429,headers:{get:()=>"120"},json:async()=>({secret:"redacted"})};});
 assert.equal(rate.workers[0].retried,3);assert.equal(calls,1);
 let s=await state();assert.equal(s.last_outcome,"RATE_LIMIT");assert.ok(s.last_metrics.cooldown_ms>=120000);
 assert.equal(await count("SELECT count(*) AS n FROM public.audit_events"),0);
 assert.equal((await run(()=>{throw Error("COOLDOWN_NETWORK");})).status,"COOLDOWN");
 assert.equal(await count("SELECT count(*) AS n FROM public.billing_subscriptions WHERE provider_namespace='odoo_online' AND provider_verified_at<clock_timestamp()-interval '60 seconds'"),3);
 // Advance only fixture cooldown/retry timestamps to exercise recovery without wall-clock wait.
 await q("UPDATE public.us_saas_runtime_control SET not_before=clock_timestamp()-interval '1 second'");
 await q("UPDATE public.async_jobs SET run_at=(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 second' WHERE job_type='us_saas_reconcile'");
 const t=provider(3),r=await run(t.fetchImpl);
 assert.equal(r.workers[0].done,3);s=await state();assert.equal(s.last_outcome,"OK");assert.equal(s.consecutive_failures,0);
 assert.equal(await count("SELECT count(*) AS n FROM public.audit_events"),3);
});
test("application auth rejection is distinguished from transport and does not revoke",async()=>{
 await seed(2);
 const r=await run(async()=>({ok:true,status:200,headers:{get:()=>null},json:async()=>({result:false})}));
 assert.equal(r.workers[0].retried,2);assert.equal((await state()).last_outcome,"AUTH_REJECTED");
 assert.equal(await count("SELECT count(*) AS n FROM public.audit_events"),0);
 assert.equal(await count("SELECT count(*) AS n FROM public.billing_subscriptions WHERE provider_namespace='odoo_online' AND subscription_status='active'"),2);
});
test("replica advisory lock + durable crash guard prevents concurrent provider requests",async()=>{
 await seed(2);const c=await db.connect();
 try{
  await c.query("SELECT pg_advisory_lock(594601,6)");
  assert.equal((await run(()=>{throw Error("NETWORK");})).status,"BUSY");
 }finally{await c.query("SELECT pg_advisory_unlock(594601,6)");c.release();}
 await q("UPDATE public.us_saas_runtime_control SET not_before=clock_timestamp()+interval '60 seconds',last_outcome='RUNNING'");
 assert.equal((await run(()=>{throw Error("NETWORK");})).status,"COOLDOWN");
 assert.equal(await count("SELECT count(*) AS n FROM public.async_jobs"),0);
});
test("no work produces IDLE, zero provider calls, no false paid health",async()=>{
 await seed(0);const r=await run(()=>{throw Error("NETWORK");}),s=await state();
 assert.equal(r.status,"RAN");assert.equal(s.last_outcome,"IDLE");assert.equal(s.last_metrics.rpc,0);
 assert.equal(r.health.total,0);assert.equal(r.health.active,0);
});

test("backpressure caps outstanding jobs and drains existing work without enqueuing another batch",async()=>{
 await seed(101);
 await q(`INSERT INTO public.async_jobs(job_type,payload,status,run_at,attempts,max_attempts,idempotency_key)
 SELECT 'us_saas_reconcile',jsonb_build_object('request_id',i::text),'pending',
 (clock_timestamp() AT TIME ZONE 'UTC')+interval '60 seconds',0,2,'fixture-backlog-'||i
 FROM generate_series(1,100) i`);
 const r=await run(()=>{throw Error("FUTURE_JOB_NETWORK");});
 assert.equal(r.enqueued,0);assert.equal(r.workers[0].claimed,0);
 assert.equal(await count("SELECT count(*) AS n FROM public.async_jobs WHERE job_type='us_saas_reconcile'"),100);
});
test("missing runtime state fails closed before provider or enqueue",async()=>{
 await seed(1);
 await q("DELETE FROM public.us_saas_runtime_control");
 try{
  const r=await run(()=>{throw Error("NETWORK");});
  assert.equal(r.status,"TICK_ERROR");assert.equal(await count("SELECT count(*) AS n FROM public.async_jobs"),0);
 }finally{await q("INSERT INTO public.us_saas_runtime_control(singleton) VALUES(true)");}
});
test("combined PG + populated 1000 owners/3000 invoices + measured latency replay + runtime pacing",{timeout:300000},async()=>{
 await seed(1000);
 const f=fixtureData(1000),date=new Date(),year=date.getUTCFullYear(),month=date.getUTCMonth();
 const day=d=>d.toISOString().slice(0,10);
 for(let j=1;j<3;j++)for(let i=0;i<1000;i++){
  const o=f.data["sale.order"][i],inv=f.data["account.move"][i],line=f.data["account.move.line"][i],pay=f.data["account.payment"][i];
  const id=1000000+j*10000+i,ln=2000000+j*10000+i,p=3000000+j*10000+i;
  const start=new Date(Date.UTC(year,month-j,1)),end=new Date(Date.UTC(year,month-j+1,0));
  o.start_date=day(start);o.invoice_ids.push(id);
  f.data["account.move"].push({...inv,id,invoice_line_ids:[ln],payment_ids:[p],invoice_date:day(start)});
  f.data["account.move.line"].push({...line,id:ln,move_id:[id,"fixture"],deferred_start_date:day(start),deferred_end_date:day(end)});
  f.data["account.payment"].push({...pay,id:p,invoice_ids:[id]});
 }
 const trace=[334.03,1001.88,652.75,313.57,598.22,324.36,1282.45,366.49,324.76,968.21,332.60,330.77,331.27,330.93,326.12,580.15,330.57,328.20,982.05,1055.27,333.60,333.29,333.73,333.90];
 const auth=[1340,1685,7275];
 const t=fixtureTransport(f.data,{latency:(m,i)=>m==="auth"?auth[(i-1)%auth.length]:Math.round(trace[(i-1)%trace.length])});
 const transport=(url,o)=>{assert.equal(url.origin,"https://totem-platform.odoo.com");return t.fetchImpl(new URL("https://fixture.invalid/jsonrpc"),o);};
 const start=Date.now();let maxAge=0,done=0,peak=0;
 for(let i=0;i<20;i++){
  if(i)await new Promise(r=>setTimeout(r,1000)); // same runtime work cadence
  const r=await run(transport),s=await state();
  assert.equal(r.status,"RAN",JSON.stringify({r,s}));
  assert.equal(r.workers[0].done,50,JSON.stringify({r,s}));
  assert.equal(s.last_outcome,"OK");assert.ok(s.last_metrics.peak<=4);
  done+=r.workers[0].done;maxAge=Math.max(maxAge,r.health.max_active_age_s);peak=Math.max(peak,s.last_metrics.peak);
  assert.ok(maxAge<300);assert.ok(Date.now()-start<235000);
 }
 assert.equal(done,1000);assert.equal(t.metrics.auth,20);assert.equal(t.metrics.reads,280);
 assert.equal(await count("SELECT count(*) AS n FROM public.async_jobs WHERE status='done' AND job_type='us_saas_reconcile'"),1000);
 assert.equal(await count("SELECT count(*) AS n FROM public.audit_events"),1000);
 assert.equal(await count("SELECT count(DISTINCT data->>'request_id') AS n FROM public.audit_events"),1000);
 assert.equal(await count("SELECT count(*) AS n FROM public.billing_subscriptions WHERE owner_id=999999 AND wallet_only AND provider_namespace IS NULL"),1);
 console.log("G5_T6G_COMBINED",JSON.stringify({owners:1000,invoices:3000,done,elapsedMs:Date.now()-start,maxAgeSeconds:maxAge,objectReads:t.metrics.reads,auth:t.metrics.auth,peak}));
});

test("independent heartbeat watchdog detects dead runtime, fresh cooldown and recovery",async()=>{
 await seed(1);
 const never=await readUsSaasRuntimeWatchdog(db);assert.equal(never.severity,"CRITICAL");assert.equal(never.reason,"HEARTBEAT_MISSING_OR_STALE");
 await q("UPDATE public.us_saas_runtime_control SET last_heartbeat_at=clock_timestamp()-interval '61 seconds',last_outcome='RUNNING'");
 assert.equal((await readUsSaasRuntimeWatchdog(db)).severity,"CRITICAL");
 await q("UPDATE public.us_saas_runtime_control SET last_heartbeat_at=clock_timestamp(),last_outcome='RATE_LIMIT',consecutive_failures=1,not_before=clock_timestamp()+interval '10 minutes'");
 assert.equal((await readUsSaasRuntimeWatchdog(db)).severity,"WARN");
 assert.equal((await run(()=>{throw Error("NETWORK");})).status,"COOLDOWN");
 assert.ok((await readUsSaasRuntimeWatchdog(db)).heartbeat_age_s<2);
 await q("UPDATE public.us_saas_runtime_control SET not_before=clock_timestamp()-interval '1 second'");
 const t=provider(1);assert.equal((await run(t.fetchImpl)).workers[0].done,1);
 assert.equal((await readUsSaasRuntimeWatchdog(db)).severity,"OK");
});
test("idle after prior failure never resets the durable failure streak",async()=>{
 await seed(0);
 await q("UPDATE public.us_saas_runtime_control SET consecutive_failures=3,last_outcome='PROVIDER_ERROR'");
 const r=await run(()=>{throw Error("NETWORK");});
 assert.equal(r.status,"RAN");assert.equal((await state()).consecutive_failures,3);
});
