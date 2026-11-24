// G5 T6-D: REAL isolated PostgreSQL, source code + real queue + real audit.
// Odoo is deliberately simulated. No production connection or external effect.
import test,{before,beforeEach,after} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {setTimeout as delay} from "node:timers/promises";
import pg from "pg";
import {runUsSaasReconciliationTick} from "../jobs/usSaasReconciliationTick.js";
import {reconcileUsSaasOpening} from "../src/services/billing/usSaasReconciliation.js";
import {US_SAAS_SYSTEM_ACTOR,writeSystemUsSaasReconciliationAudit} from "../src/services/billing/usSaasReconciliationAudit.js";
import {ownerQueuePage,ownerQueueResult} from "../src/services/provision/ownerOpeningQueueRead.js";

const conn=process.env.G5_TEST_DATABASE_URL;
if(!conn||process.env.G5_T6D_ISOLATED!== "YES"||process.env.DATABASE_URL)
  throw Error("G5_T6D_ISOLATED_DATABASE_REQUIRED");
const url=new URL(conn);
if(url.hostname!=="127.0.0.1"||url.pathname!=="/g5_t6d_test")throw Error("G5_T6D_REFUSES_NON_LOCAL_DATABASE");
const db=new pg.Pool({connectionString:conn,max:12,connectionTimeoutMillis:5000,
  statement_timeout:15000,options:"-c timezone=UTC -c datestyle=ISO,YMD"});
const actor=US_SAAS_SYSTEM_ACTOR;
const env={TOTEM_US_ODOO_SAAS_RECONCILIATION_ENABLED:"true",
 TOTEM_US_ODOO_SAAS_ACCESS_ENABLED:"true",TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED:"true"};
const q=(sql,args)=>db.query(sql,args);
const count=async(sql,args)=>Number((await q(sql,args)).rows[0].n);
const migrationNames=["g5_async_jobs_lease_v2.sql","g5_us_odoo_source_identity_v1.sql","g5_us_odoo_billing_projection_v1.sql"];
before(async()=>{
 const r=await q("SELECT current_database() AS db,version() AS version");
 assert.equal(r.rows[0].db,"g5_t6d_test");assert.match(r.rows[0].version,/PostgreSQL 17\./);
 assert.equal(await count("SELECT count(*) AS n FROM pg_tables WHERE schemaname='public'"),0);
 await q(await readFile(new URL("./sql/g5-t6d-prod-schema-fixture.sql",import.meta.url),"utf8"));
 // A historical wallet row exists BEFORE the additive migrations.
 await q("INSERT INTO public.billing_subscriptions(owner_type,owner_id,amount,currency) VALUES('salon',999999,10,'KGS')");
 for(const name of migrationNames)await q(await readFile(new URL("../migrations/"+name,import.meta.url),"utf8"));
 assert.equal(await count("SELECT count(*) AS n FROM public.billing_subscriptions WHERE owner_id=999999 AND provider_namespace IS NULL AND wallet_only"),1);
 console.log("G5_T6D_SCHEMA",r.rows[0].version,"3 migrations PASS; existing KG row preserved");
});
beforeEach(async()=>{await q("TRUNCATE public.async_jobs,public.audit_events,public.billing_subscriptions,public.owner_opening_requests RESTART IDENTITY");});
after(async()=>{await db.end();});
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
function evidence(r,change={}){
 const now=Date.now();
 return {status:"PAID_VERIFIED",canActivate:true,requestId:Number(r.id),
 createdOwnerId:Number(r.created_owner_id),createdAuthUserId:Number(r.created_auth_user_id),
 sourceRequestId:r.source_request_id,ownerType:r.owner_type,partnerId:Number(r.source_partner_id),
 companyId:4,websiteId:5,verifiedAtUtc:new Date(now).toISOString(),
 periodStartUtc:new Date(now-86400000).toISOString(),periodEndExclusiveUtc:new Date(now+30*86400000).toISOString(),
 subscriptionOrderId:Number(r.id)+30000,invoiceId:Number(r.id)+40000,commercialPolicyVersion:"qa_v1",...change};
}
const recon=(readback,extra={})=>reconcileUsSaasOpening({pool:db,requestId:1,readback,
 writeAudit:writeSystemUsSaasReconciliationAudit,operator:actor,...extra});
const billing=async()=> (await q("SELECT *,xmin::text AS rev FROM public.billing_subscriptions WHERE owner_id=1")).rows[0];
test("both real CHECK constraints reject NULL namespace with populated provider/source tuple",async()=>{
 await seed(1);
 await assert.rejects(()=>q("UPDATE public.billing_subscriptions SET provider_namespace=NULL WHERE owner_id=1"),e=>e.code==="23514");
 await assert.rejects(()=>q("UPDATE public.owner_opening_requests SET source_namespace=NULL WHERE id=1"),e=>e.code==="23514");
});
test("real paid UPDATE and system audit commit together; no human user or PII in audit",async()=>{
 await seed(1);
 const a=await recon(async r=>evidence(r,{subscriptionOrderId:90001,renewedFromOrderId:30001,invoiceId:90002}));
 assert.equal(a.status,"PAID_VERIFIED");assert.equal(a.ownerId,1);
 const b=await billing();assert.equal(Number(b.provider_subscription_order_id),90001);
 const rows=(await q("SELECT * FROM public.audit_events")).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].actor,actor.actor);assert.equal(rows[0].core_user_id,null);
 assert.equal(rows[0].data.request_id,1);assert.equal(rows[0].data.entity_type,"owner_opening_request");
 assert.equal(rows[0].data.email,undefined);assert.equal(rows[0].data.invoice_id,90002);
 assert.equal(await count("SELECT count(*) AS n FROM public.owner_opening_requests"),1);
});
test("real transaction rolls back billing UPDATE when audit fails",async()=>{
 await seed(1);const old=await billing();
 await assert.rejects(()=>recon(async r=>evidence(r),{writeAudit:async()=>{throw Error("AUDIT_FIXTURE_FAILURE");}}),/AUDIT_FIXTURE_FAILURE/);
 assert.equal((await billing()).rev,old.rev);
 assert.equal(await count("SELECT count(*) AS n FROM public.audit_events"),0);
});
test("concurrent older paid proof cannot overwrite committed revocation (real MVCC)",async()=>{
 await seed(1);
 let ready,release;
 const started=new Promise(r=>{ready=r;});const barrier=new Promise(r=>{release=r;});
 const old=recon(async r=>{const e=evidence(r);ready();await barrier;return e;});
 try{
  await started;
  const revoke=await recon(async()=>({status:"WAIT",reason:"ODOO_INVOICE_REVERSED"}));
  assert.equal(revoke.status,"REVOKED");
 }finally{release();}
 const stale=await old;assert.equal(stale.reason,"US_SAAS_RECONCILIATION_PROJECTION_CHANGED");
 assert.equal((await billing()).subscription_status,"blocked");
 assert.equal(await count("SELECT count(*) AS n FROM public.audit_events"),1);
});
test("concurrent older revocation cannot overwrite committed newer paid proof (real MVCC)",async()=>{
 await seed(1);let ready,release;
 const started=new Promise(r=>{ready=r;});const barrier=new Promise(r=>{release=r;});
 const old=recon(async()=>{ready();await barrier;return {status:"WAIT",reason:"ODOO_INVOICE_REVERSED"};});
 try{await started;assert.equal((await recon(async r=>evidence(r))).status,"PAID_VERIFIED");}
 finally{release();}
 assert.equal((await old).reason,"US_SAAS_RECONCILIATION_PROJECTION_CHANGED");
 assert.equal((await billing()).subscription_status,"active");
});
test("provider WAIT never refreshes evidence; durable queue retries and preserves KG",async()=>{
 await seed(1);const old=await billing();
 const run=await runUsSaasReconciliationTick({db,env,limit:2,concurrency:1,
   reconcile:opts=>reconcileUsSaasOpening({...opts,readback:async()=>({status:"WAIT",reason:"ODOO_UNAVAILABLE"})})});
 assert.equal(run.workers[0].retried,1);
 assert.equal((await billing()).rev,old.rev);
 assert.equal(await count("SELECT count(*) AS n FROM public.async_jobs WHERE status='pending' AND attempts=1"),1);
 assert.equal(await count("SELECT count(*) AS n FROM public.billing_subscriptions WHERE owner_id=999999 AND wallet_only AND provider_namespace IS NULL"),1);
});
test("system audit rejects fake Admin ID or external fields",async()=>{
 await seed(1);
 const old=await billing();
 await assert.rejects(()=>recon(async r=>evidence(r),{operator:{actor:actor.actor,id:123}}),/SYSTEM_AUDIT_CONTRACT_INVALID/);
 assert.equal((await billing()).rev,old.rev);
});
test("two scheduler replicas cannot concurrently drain the same batch",async()=>{
 await seed(8);let active=0,peak=0;
 const run=()=>runUsSaasReconciliationTick({db,env,limit:8,concurrency:4,reconcile:opts=>
 reconcileUsSaasOpening({...opts,readback:async r=>{active++;peak=Math.max(peak,active);try{await delay(80);return evidence(r);}finally{active--;}}})});
 const results=await Promise.all([run(),run()]);
 assert.deepEqual(results.map(x=>x.status).sort(),["BUSY","RAN"]);
 assert.ok(peak<=4);
 assert.equal(await count("SELECT count(*) AS n FROM public.async_jobs WHERE status='done'"),8);
 assert.equal(await count("SELECT count(*) AS n FROM public.audit_events"),8);
});
test("real SQL cursor handles identical timestamps and US scope without duplicates",async()=>{
 await seed(7);
 await q("UPDATE public.owner_opening_requests SET created_at='2026-11-24 01:00:00.123456+00'");
 await q("UPDATE public.owner_opening_requests SET precheck_result_json='{\"market_code\":\"KG\"}' WHERE id=7");
 let cursor,seen=[];
 do{
  const p=ownerQueuePage({market:"US",limit:"2",...(cursor?{cursor}:{})});
  const result=await q("SELECT id,id::text AS queue_cursor_id,created_at::text AS queue_cursor_at FROM public.owner_opening_requests "+p.where+" ORDER BY created_at DESC NULLS LAST,id DESC LIMIT "+p.limitParam,p.values);
  const page=ownerQueueResult(result.rows,p);seen.push(...page.requests.map(x=>Number(x.id)));cursor=page.pagination.next_cursor;
 }while(cursor);
 assert.deepEqual(seen,[6,5,4,3,2,1]);
});
for(const [n,latency] of [[50,1000],[250,250],[1000,200]]){
 test("real queue load "+n+" owners; simulated Odoo "+latency+"ms; evidence age <300s", {timeout:240000},async()=>{
  await seed(n);let active=0,peak=0,ticks=0,maxAge=0;
  const t=Date.now();
  const provider=async r=>{active++;peak=Math.max(peak,active);try{await delay(latency);return evidence(r);}finally{active--;}};
  while(await count("SELECT count(*) AS n FROM public.billing_subscriptions WHERE provider_namespace='odoo_online' AND provider_verified_at < clock_timestamp()-interval '60 seconds'")){
   const result=await runUsSaasReconciliationTick({db,env,limit:50,concurrency:4,
    reconcile:opts=>reconcileUsSaasOpening({...opts,readback:provider})});
   assert.equal(result.status,"RAN");ticks++;
   const age=Number((await q("SELECT max(extract(epoch from clock_timestamp()-provider_verified_at)) AS age FROM public.billing_subscriptions WHERE provider_namespace='odoo_online'")).rows[0].age);
   maxAge=Math.max(maxAge,age);assert.ok(age<300,"freshness TTL exceeded");
   assert.ok(Date.now()-t<230000,"batch freshness budget exceeded");
   assert.ok(result.workers.reduce((a,w)=>a+w.done,0)>0,"no progress");
  }
  assert.ok(peak<=4);
  assert.equal(await count("SELECT count(*) AS n FROM public.audit_events"),n);
  assert.equal(await count("SELECT count(*) AS n FROM public.async_jobs WHERE status='done'"),n);
  assert.equal(await count("SELECT count(*) AS n FROM public.billing_subscriptions WHERE provider_namespace='odoo_online'"),n);
  assert.equal(await count("SELECT count(*) AS n FROM public.billing_subscriptions WHERE owner_id=999999 AND wallet_only AND provider_namespace IS NULL"),1);
  console.log("G5_T6D_LOAD "+JSON.stringify({owners:n,simulatedOdooMs:latency,elapsedMs:Date.now()-t,peakConcurrent:peak,ticks,maxEvidenceAgeSeconds:maxAge}));
 });
}
