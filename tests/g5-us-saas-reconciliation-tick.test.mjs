import test from "node:test";
import assert from "node:assert/strict";
import { runUsSaasReconciliationTick, US_SAAS_RECONCILE_JOB } from "../jobs/usSaasReconciliationTick.js";
const env={TOTEM_US_ODOO_SAAS_RECONCILIATION_ENABLED:"true",TOTEM_US_ODOO_SAAS_ACCESS_ENABLED:"true",TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED:"true"};
const operator={actor:"system:us_saas_reconciliation"};
function fixture({acquired=true,result={status:"PAID_VERIFIED"}}={}){
 const calls=[],jobs=[],work=[];
 const client={async query(sql,args){calls.push(sql);
  if(sql.includes("pg_try_advisory"))return {rows:[{acquired}]};
  if(sql.includes("clock_timestamp() AS now"))return {rows:[{now:"2026-11-24T01:00:00Z"}]};
  if(sql.includes("WITH last_job"))return {rows:[{request_id:"11"},{request_id:"12"}]};
  return {rows:[]};
 },release(){calls.push("release");}};
 const opts={db:{connect:async()=>client},env,operator,writeAudit:async()=>{},
  enqueue:async(q)=>{jobs.push(q);return {enqueued:true};},
  worker:async(q)=>{work.push(q);return {done:1};},
  reconcile:async()=>result};
 return {calls,jobs,work,opts,client};
}
test("default HOLD never touches DB or calls external provider",async()=>{
 assert.deepEqual(await runUsSaasReconciliationTick({env:{}}),{status:"HOLD",enqueued:0,workers:[]});
});
test("scheduler enqueues only scoped jobs using existing client and stable minute key",async()=>{
 const f=fixture();const r=await runUsSaasReconciliationTick(f.opts);
 assert.equal(r.enqueued,2);assert.equal(f.jobs[0].job_type,US_SAAS_RECONCILE_JOB);
 assert.equal(f.jobs[0].dbClient,f.client);assert.equal(f.jobs[0].max_attempts,2);
 assert.match(f.jobs[0].idempotency_key,/^us_saas_reconcile:11:\d+$/);
 assert.equal(f.work.length,2);assert.equal(f.work[0].limit,1);
 assert.ok(f.calls.includes("COMMIT"));assert.ok(f.calls.includes("release"));
});
test("another replica holding enqueue lock does not enqueue",async()=>{
 const f=fixture({acquired:false});const r=await runUsSaasReconciliationTick(f.opts);
 assert.equal(r.enqueued,0);assert.equal(f.jobs.length,0);assert.equal(f.work.length,2);
});
test("WAIT is a retryable failure, never fake success",async()=>{
 const f=fixture({result:{status:"WAIT"}});await runUsSaasReconciliationTick(f.opts);
 await assert.rejects(()=>f.work[0].handlers[US_SAAS_RECONCILE_JOB]({request_id:"11"}),/US_SAAS_RECONCILIATION_WAIT/);
});
test("verified readback and revocation are the only acknowledged results",async()=>{
 for(const status of ["PAID_VERIFIED","REVOKED"]){
  const f=fixture({result:{status}});await runUsSaasReconciliationTick(f.opts);
  await f.work[0].handlers[US_SAAS_RECONCILE_JOB]({request_id:"11"});
 }
});
test("requires system actor and rejects invalid bounds before database access",async()=>{
 const f=fixture();await assert.rejects(()=>runUsSaasReconciliationTick({...f.opts,operator:{id:1}}),/CONTRACT_INVALID/);
 await assert.rejects(()=>runUsSaasReconciliationTick({...f.opts,concurrency:5}),/CONTRACT_INVALID/);
 assert.equal(f.calls.length,0);
});
