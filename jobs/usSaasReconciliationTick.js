// G5 T6 source-only tick: reuse existing PostgreSQL async_jobs and leased worker.
// No auto-start, no Odoo writes, no account provisioning or welcome email.
// Runtime wiring requires approved system audit identity and load/SQL QA.
import { enqueueJob } from "../utils/enqueueJob.js";
import {runQueueBatchWorker} from "./queueWorker.js";
import {commercialWriterRelease} from "../src/services/provision/usCommercialWriterRelease.js";

export const US_SAAS_RECONCILE_JOB = "us_saas_reconcile";
const CANDIDATES_SQL = `
  SELECT req.id::text AS request_id
  FROM public.billing_subscriptions b
  JOIN public.owner_opening_requests req
    ON req.owner_type=b.owner_type AND req.created_owner_id=b.owner_id
    AND req.source_namespace='odoo_online'
    AND req.source_company_id=4 AND req.source_website_id=5
    AND req.source_partner_id=b.provider_partner_id
    AND req.source_request_id=b.provider_source_request_id
  LEFT JOIN LATERAL (
    SELECT created_at AS last_queued FROM public.async_jobs
    WHERE job_type='us_saas_reconcile' AND payload->>'request_id'=req.id::text
    ORDER BY created_at DESC LIMIT 1
  ) j ON true
  WHERE b.provider_namespace='odoo_online'
    AND b.provider_company_id=4 AND b.provider_website_id=5
    AND b.wallet_only=false AND b.currency='USD'
    AND b.subscription_status='active' AND b.blocked_at IS NULL AND b.provider_revoked_at IS NULL
    AND req.status IN ('activated','email_ready','email_failed','email_sent')
    AND (b.provider_verified_at IS NULL OR
         b.provider_verified_at < clock_timestamp() - interval '1 minute')
    AND NOT EXISTS (
      SELECT 1 FROM public.async_jobs
      WHERE job_type='us_saas_reconcile' AND payload->>'request_id'=req.id::text
        AND status IN ('pending','processing')
    )
  ORDER BY j.last_queued NULLS FIRST,b.provider_verified_at NULLS FIRST,b.id
  LIMIT $1
`;
function enabled(env){
  return commercialWriterRelease().projection_write===true &&
    env.TOTEM_US_ODOO_SAAS_RUNTIME_ENABLED==="true" &&
    env.TOTEM_US_ODOO_SAAS_RUNTIME_RELEASE_APPROVED==="true" &&
    env.TOTEM_US_ODOO_SAAS_BATCH_READBACK_ENABLED==="true" &&
    env.TOTEM_US_ODOO_SAAS_RECONCILIATION_ENABLED==="true" &&
    env.TOTEM_US_ODOO_SAAS_ACCESS_ENABLED==="true" &&
    env.TOTEM_US_ODOO_SAAS_ACTIVATION_ENABLED==="true";
}
function error(code){const e=new Error(code);e.code=code;return e;}
function validId(value){
  return typeof value==="string"&&/^[1-9][0-9]{0,15}$/.test(value)&&Number.isSafeInteger(Number(value));
}
export async function runUsSaasReconciliationTick({db,env=process.env,limit=1,
  enqueue=enqueueJob,batchWorker=runQueueBatchWorker,lifecycle}={}){
  if(!enabled(env))return {status:"HOLD",enqueued:0,workers:[]};
  // Until measured provider capacity is accepted, one job per tick.
  if(limit!==1||!db||typeof db.connect!=="function"||!lifecycle||
    typeof lifecycle.before!=="function"||typeof lifecycle.after!=="function"||
    typeof lifecycle.failed!=="function"||typeof lifecycle.reconcile!=="function")
    throw error("US_SAAS_SCHEDULER_CONTRACT_INVALID");
  const client=await db.connect();
  const fence=new AbortController();
  let locked=false,begun=false,destroy=false,started=false,enqueued=0;
  const onError=()=>{destroy=true;fence.abort();};
  client.on?.("error",onError);
  try{
    const lock=await client.query("SELECT pg_try_advisory_lock(594601,6) AS acquired");
    if(lock.rows[0]?.acquired!==true)return {status:"BUSY",enqueued:0,workers:[]};
    locked=true;
    const gate=await lifecycle.before(client,{signal:fence.signal});
    if(gate?.status!=="READY")return {status:gate?.status||"HOLD",enqueued:0,workers:[]};
    started=true;
    if(![0,1].includes(gate.enqueueLimit)||fence.signal.aborted)throw error("US_SAAS_RUNTIME_QUEUE_LIMIT_INVALID");
    await client.query("BEGIN");begun=true;
    const clock=await client.query("SELECT clock_timestamp() AS now");
    const now=new Date(clock.rows[0]?.now);
    if(!Number.isFinite(now.getTime()))throw error("US_SAAS_SCHEDULER_CLOCK_INVALID");
    const candidates=gate.enqueueLimit?await client.query(CANDIDATES_SQL,[1]):{rows:[]};
    for(const row of candidates.rows){
      if(!validId(row.request_id))throw error("US_SAAS_SCHEDULER_REQUEST_INVALID");
      const q=await enqueue({job_type:US_SAAS_RECONCILE_JOB,payload:{request_id:row.request_id},
        idempotency_key:"us_saas_reconcile:"+row.request_id+":"+Math.floor(now.getTime()/60000),
        max_attempts:2,run_at:now,dbClient:client});
      if(q.enqueued)enqueued++;
    }
    await client.query("COMMIT");begun=false;
    const batch=await batchWorker({db,jobType:US_SAAS_RECONCILE_JOB,limit:1,leaseMs:60000,handler:async items=>{
      if(!enabled(env)||fence.signal.aborted||items.length!==1||!validId(items[0].payload?.request_id))
        throw error("US_SAAS_RECONCILIATION_HOLD");
      const j=items[0],signal=AbortSignal.any([j.signal,fence.signal]);
      const result=await lifecycle.reconcile({pool:db,requestId:Number(j.payload.request_id),env,signal,
        assertLease:async tx=>{
          if(signal.aborted||!enabled(env))throw error("US_SAAS_RUNTIME_LOCK_LOST");
          await j.assertLease(tx);
          if(signal.aborted||!enabled(env))throw error("US_SAAS_RUNTIME_LOCK_LOST");
        }});
      lifecycle.observeResults?.([result]);
      // A completed queue item is not a paid grant. Only the exact restoration
      // HOLD is terminal for this item; the selectors exclude that row.
      const held=result?.status==="HOLD"&&result.reason==="US_SAAS_RESTORATION_AUTHORITY_HOLD";
      return [held||result?.status==="PAID_VERIFIED"||result?.status==="REVOKED"?null:error("US_SAAS_RECONCILIATION_WAIT")];
    }});
    const result={status:"RAN",enqueued,workers:[batch]};
    if(fence.signal.aborted)throw error("US_SAAS_RUNTIME_LOCK_LOST");
    await lifecycle.after(client,result);return result;
  }catch(e){
    if(begun)try{await client.query("ROLLBACK");}catch{destroy=true;}
    if(started&&!destroy)try{await lifecycle.failed(client);}catch{destroy=true;}
    throw e;
  }finally{
    if(locked&&!destroy)try{
      const r=await client.query("SELECT pg_advisory_unlock(594601,6) AS released");
      if(r.rows[0]?.released!==true)destroy=true;
    }catch{destroy=true;}
    client.removeListener?.("error",onError);client.release(destroy);
    if(destroy)throw error("US_SAAS_SCHEDULER_CONNECTION_DISCARDED");
  }
}
