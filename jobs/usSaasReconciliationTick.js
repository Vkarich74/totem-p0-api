// G5 T6 source-only tick: reuse existing PostgreSQL async_jobs and leased worker.
// No auto-start, no Odoo writes, no account provisioning or welcome email.
// Runtime wiring requires approved system audit identity and load/SQL QA.
import { enqueueJob } from "../utils/enqueueJob.js";
import { runQueueWorker } from "./queueWorker.js";
import { reconcileUsSaasOpening } from "../src/services/billing/usSaasReconciliation.js";

export const US_SAAS_RECONCILE_JOB = "us_saas_reconcile";
const CANDIDATES_SQL = `
  WITH last_job AS (
    SELECT payload->>'request_id' AS request_id, MAX(created_at) AS last_queued,
           BOOL_OR(status IN ('pending','processing')) AS outstanding
    FROM public.async_jobs
    WHERE job_type = 'us_saas_reconcile'
    GROUP BY payload->>'request_id'
  )
  SELECT req.id::text AS request_id
  FROM public.billing_subscriptions b
  JOIN public.owner_opening_requests req
    ON req.owner_type=b.owner_type AND req.created_owner_id=b.owner_id
    AND req.source_namespace='odoo_online'
    AND req.source_company_id=4 AND req.source_website_id=5
    AND req.source_partner_id=b.provider_partner_id
    AND req.source_request_id=b.provider_source_request_id
  LEFT JOIN last_job j ON j.request_id=req.id::text
  WHERE b.provider_namespace='odoo_online'
    AND b.provider_company_id=4 AND b.provider_website_id=5
    AND req.status IN ('activated','email_ready','email_failed','email_sent')
    AND (b.provider_verified_at IS NULL OR
         b.provider_verified_at < clock_timestamp() - interval '1 minute')
    AND COALESCE(j.outstanding,false)=false
  ORDER BY j.last_queued NULLS FIRST,b.provider_verified_at NULLS FIRST,b.id
  LIMIT $1
`;
function enabled(env){
  return env.TOTEM_US_ODOO_SAAS_RECONCILIATION_ENABLED==="true" &&
    env.TOTEM_US_ODOO_SAAS_ACCESS_ENABLED==="true" &&
    env.TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED==="true";
}
function error(code){const e=new Error(code);e.code=code;return e;}
function validId(value){
  return typeof value==="string"&&/^[1-9][0-9]{0,15}$/.test(value)&&Number.isSafeInteger(Number(value));
}
export async function runUsSaasReconciliationTick({
  db,env=process.env,writeAudit,operator,limit=8,concurrency=2,
  enqueue=enqueueJob,worker=runQueueWorker,reconcile=reconcileUsSaasOpening,
}={}){
  if(!enabled(env))return {status:"HOLD",enqueued:0,workers:[]};
  if(!db||typeof db.connect!=="function"||typeof writeAudit!=="function"||
    !operator||operator.actor!=="system:us_saas_reconciliation"||
    !Number.isInteger(limit)||limit<1||limit>50||
    !Number.isInteger(concurrency)||concurrency<1||concurrency>4)
    throw error("US_SAAS_SCHEDULER_CONTRACT_INVALID");
  let enqueued=0;
  const client=await db.connect();
  try{
    await client.query("BEGIN");
    // One enqueue scan across process replicas; transaction never spans Odoo.
    const lock=await client.query("SELECT pg_try_advisory_xact_lock(594601, 6) AS acquired");
    if(lock.rows[0]?.acquired===true){
      const clock=await client.query("SELECT clock_timestamp() AS now");
      const now=new Date(clock.rows[0]?.now);
      if(!Number.isFinite(now.getTime()))throw error("US_SAAS_SCHEDULER_CLOCK_INVALID");
      const candidates=await client.query(CANDIDATES_SQL,[limit]);
      const bucket=Math.floor(now.getTime()/60000);
      for(const row of candidates.rows){
        if(!validId(row.request_id))throw error("US_SAAS_SCHEDULER_REQUEST_INVALID");
        const q=await enqueue({job_type:US_SAAS_RECONCILE_JOB,
          payload:{request_id:row.request_id},
          idempotency_key:"us_saas_reconcile:"+row.request_id+":"+bucket,
          max_attempts:2,run_at:now,dbClient:client});
        if(q.enqueued)enqueued++;
      }
    }
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}
  finally{client.release();}
  const handler=async(payload,{signal}={})=>{
    if(!enabled(env)||signal?.aborted)throw error("US_SAAS_RECONCILIATION_HOLD");
    if(!validId(payload?.request_id))throw error("US_SAAS_SCHEDULER_REQUEST_INVALID");
    const result=await reconcile({pool:db,requestId:Number(payload.request_id),writeAudit,operator});
    if(result?.status==="PAID_VERIFIED"||result?.status==="REVOKED")return;
    // WAIT is not a successful refresh; bounded queue retries preserve fail-closed.
    throw error("US_SAAS_RECONCILIATION_WAIT");
  };
  const workers=await Promise.allSettled(Array.from({length:concurrency},()=>
    worker({db,limit:1,leaseMs:60000,handlers:{[US_SAAS_RECONCILE_JOB]:handler}})));
  if(workers.some(x=>x.status==="rejected"))throw error("US_SAAS_WORKER_TICK_FAILED");
  return {status:"RAN",enqueued,workers:workers.map(x=>x.value)};
}
