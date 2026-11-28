// Aggregate-only monitoring, no public route, no IDs, no PII, no provider calls.
export const US_SAAS_RUNTIME_HEALTH_SQL=`
WITH clock AS (SELECT statement_timestamp() AS t),
scope AS (
 SELECT b.*, r.id AS request_id
 FROM public.billing_subscriptions b
 LEFT JOIN public.owner_opening_requests r
   ON r.owner_type=b.owner_type AND r.created_owner_id=b.owner_id
   AND r.source_namespace='odoo_online' AND r.source_company_id=4 AND r.source_website_id=5
   AND r.source_partner_id=b.provider_partner_id
   AND r.source_request_id=b.provider_source_request_id
   AND r.status IN ('activated','email_ready','email_failed','email_sent')
 WHERE b.provider_namespace='odoo_online' AND b.provider_company_id=4 AND b.provider_website_id=5
), projection AS (
 SELECT count(*) AS total,
 count(*) FILTER (WHERE request_id IS NULL) AS orphaned,
 count(*) FILTER (WHERE provider_verified_at IS NULL OR provider_verified_at<t-interval '60 seconds') AS due,
 count(*) FILTER (WHERE subscription_status='active' AND
   (provider_verified_at IS NULL OR provider_verified_at<t-interval '240 seconds'
    OR provider_verified_at>t+interval '1 second')) AS at_risk,
 count(*) FILTER (WHERE subscription_status='active' AND
   (provider_verified_at IS NULL OR provider_verified_at<t-interval '300 seconds'
    OR provider_verified_at>t+interval '1 second')) AS stale,
 count(*) FILTER (WHERE subscription_status='active' AND
   (current_period_end IS NULL OR current_period_end<=t)) AS expired_active,
 count(*) FILTER (WHERE subscription_status='active') AS active,
 count(*) FILTER (WHERE subscription_status='blocked') AS blocked,
 max(extract(epoch FROM t-provider_verified_at)) FILTER
   (WHERE subscription_status='active') AS max_active_age_s
 FROM scope CROSS JOIN clock
), queue AS (
 SELECT count(*) FILTER (WHERE status='pending') AS pending,
 count(*) FILTER (WHERE status='pending' AND run_at<=(t AT TIME ZONE 'UTC')) AS runnable,
 count(*) FILTER (WHERE status='processing') AS processing,
 count(*) FILTER (WHERE status='processing' AND (lease_until IS NULL OR lease_until<=t)) AS lease_expired,
 count(*) FILTER (WHERE status='failed' AND updated_at>= (t AT TIME ZONE 'UTC')-interval '15 minutes') AS recent_failed,
 count(*) FILTER (WHERE status='done' AND updated_at>= (t AT TIME ZONE 'UTC')-interval '15 minutes') AS recent_done,
 max(extract(epoch FROM (t AT TIME ZONE 'UTC')-run_at)) FILTER
 (WHERE status='pending' AND run_at<=(t AT TIME ZONE 'UTC')) AS oldest_runnable_s
 FROM public.async_jobs CROSS JOIN clock WHERE job_type='us_saas_reconcile'
)
SELECT clock.t AS sampled_at,projection.*,queue.* FROM clock CROSS JOIN projection CROSS JOIN queue
`;
const countKeys=["total","orphaned","due","at_risk","stale","expired_active","active","blocked",
 "pending","runnable","processing","lease_expired","recent_failed","recent_done"];
function number(value){
 // pg int8 normally returns decimal text; custom parsers may return a number.
 // Never coerce booleans, containers, blank strings or non-decimal syntax.
 if(typeof value!=="number"&&
   (typeof value!=="string"||value.trim()!==value||!/^(?:0|[1-9][0-9]*)$/.test(value)))
   throw Error("US_SAAS_MONITOR_INVALID");
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<0)throw Error("US_SAAS_MONITOR_INVALID");return n;
}
function age(value){
 if(value===null)return null;
 // PostgreSQL extract(epoch ...) returns decimal numeric text or a number.
 // Negative ages are valid evidence of clock skew; only null means absent.
 if(typeof value!=="number"&&
   (typeof value!=="string"||value.trim()!==value||!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)))
   throw Error("US_SAAS_MONITOR_INVALID");
 const n=Number(value), rounded=Math.round(n*1000)/1000;
 if(!Number.isFinite(n)||!Number.isFinite(rounded))throw Error("US_SAAS_MONITOR_INVALID");
 return rounded;
}
export async function readUsSaasRuntimeHealth(db){
 const {rows}=await db.query(US_SAAS_RUNTIME_HEALTH_SQL);
 if(rows.length!==1)throw Error("US_SAAS_MONITOR_INVALID");
 const row=rows[0];
 if(row.sampled_at==null)throw Error("US_SAAS_MONITOR_INVALID");
 const time=new Date(row.sampled_at);
 if(!Number.isFinite(time.getTime()))throw Error("US_SAAS_MONITOR_INVALID");
 const result={sampled_at:time.toISOString()};
 for(const k of countKeys)result[k]=number(row[k]);
 // Every bound below follows directly from the same SQL snapshot: FILTER
 // subsets of their populations and mutually exclusive subscription statuses.
 // Reject contradictory aggregates rather than misreporting a pristine HOLD.
 // Use subtraction for the disjoint sum to avoid unsafe integer addition.
 if(result.orphaned>result.total||result.due>result.total||
    result.blocked>result.total||result.active>result.total-result.blocked||
    result.at_risk>result.active||result.stale>result.at_risk||
    result.expired_active>result.active||result.runnable>result.pending||
    result.lease_expired>result.processing)
   throw Error("US_SAAS_MONITOR_INCONSISTENT");
 result.max_active_age_s=age(row.max_active_age_s);
 // MAX ignores NULL verification timestamps. If every active timestamp is
 // NULL, all active rows satisfy the due, at_risk and stale SQL predicates.
 // A non-null MAX needs at least one active row; negative ages remain valid.
 if((result.active===0&&result.max_active_age_s!==null)||
    (result.active>0&&result.max_active_age_s===null&&
     (result.stale!==result.active||result.at_risk!==result.active||result.due<result.active)))
   throw Error("US_SAAS_MONITOR_INCONSISTENT");
 result.oldest_runnable_s=age(row.oldest_runnable_s);
 // COUNT and MAX use the same non-null runnable timestamps in the same snapshot.
 // Check the raw sign before rounding can turn a negative age into zero.
 if((result.runnable===0)!==(result.oldest_runnable_s===null)||
    (result.oldest_runnable_s!==null&&Number(row.oldest_runnable_s)<0))
   throw Error("US_SAAS_MONITOR_INCONSISTENT");
 result.severity=result.stale||result.orphaned||result.expired_active?"CRITICAL":
   result.at_risk||result.lease_expired||result.recent_failed||
   (result.oldest_runnable_s??0)>60?"WARN":"OK";
 return Object.freeze(result);
}

// Independent READ ONLY watchdog, intended for a separate process/sink.
// Does not require Odoo credentials or start the scheduler.
export async function readUsSaasRuntimeWatchdog(db,{expectedMode="ACTIVE"}={}){
 if(!["ACTIVE","HOLD"].includes(expectedMode))throw Error("US_SAAS_WATCHDOG_MODE_INVALID");
 const {rows}=await db.query(`SELECT statement_timestamp() AS sampled_at,
 last_outcome,consecutive_failures,
 extract(epoch FROM statement_timestamp()-last_heartbeat_at) AS heartbeat_age_s,
 not_before>statement_timestamp() AS cooling
 FROM public.us_saas_runtime_control WHERE singleton=true`);
 if(rows.length!==1)throw Error("US_SAAS_WATCHDOG_STATE_MISSING");
 const r=rows[0],heartbeat=age(r.heartbeat_age_s),failures=number(r.consecutive_failures);
 const allowed=["NEVER","RUNNING","OK","IDLE","PARTIAL","RATE_LIMIT","AUTH_REJECTED","PROVIDER_ERROR","TICK_ERROR"];
 if(!allowed.includes(r.last_outcome)||typeof r.cooling!=="boolean"||failures>20)throw Error("US_SAAS_WATCHDOG_INVALID");
 // finish() atomically resets the streak on OK and increments it on failure.
 // IDLE and RUNNING preserve the prior streak; NEVER retains its HOLD checks.
 if((r.last_outcome==="OK"&&failures!==0)||
    (["PARTIAL","RATE_LIMIT","AUTH_REJECTED","PROVIDER_ERROR","TICK_ERROR"].includes(r.last_outcome)&&failures===0))
   throw Error("US_SAAS_WATCHDOG_INCONSISTENT");
 const health=await readUsSaasRuntimeHealth(db);
 // An intentional initial HOLD must not be reported as a dead worker.
 // Never infer HOLD from this independent process's missing worker flags.
 // Any evidence of active work or a non-pristine runtime is an incident,
 // not a reason to suppress alerts. Previously active systems need ACTIVE
 // monitoring until an explicitly reviewed operational hold contract exists.
 if(expectedMode==="HOLD"){
   const pristine=r.last_outcome==="NEVER"&&heartbeat===null&&failures===0&&
     r.cooling===false&&health.total===0&&health.pending===0&&health.processing===0&&
     health.recent_failed===0&&health.recent_done===0&&health.severity==="OK";
   return Object.freeze({severity:pristine?"OK":"CRITICAL",
     expected_mode:"HOLD",runtime_health_ok:false,
     reason:pristine?"EXPECTED_INITIAL_HOLD":"UNEXPECTED_ACTIVITY_OR_STATE_DURING_HOLD",
     heartbeat_age_s:heartbeat,last_outcome:r.last_outcome,consecutive_failures:failures,
     cooling:r.cooling,health});
 }
 const dead=r.last_outcome==="NEVER"||heartbeat===null||heartbeat< -1||heartbeat>60;
 const severity=dead||health.severity==="CRITICAL"||r.last_outcome==="AUTH_REJECTED"||r.last_outcome==="TICK_ERROR"?"CRITICAL":
   heartbeat>45||failures>0||r.cooling&&r.last_outcome!=="RUNNING"||health.severity==="WARN"?"WARN":"OK";
 return Object.freeze({severity,expected_mode:"ACTIVE",runtime_health_ok:severity==="OK",heartbeat_age_s:heartbeat,last_outcome:r.last_outcome,
   consecutive_failures:failures,cooling:r.cooling,
   reason:dead?"HEARTBEAT_MISSING_OR_STALE":severity==="OK"?"HEALTHY":"DEGRADED",
   health});
}

// Use a single read-only snapshot for the standalone monitor. Do not open
// the worker, take job leases, touch Odoo or modify runtime control.
export async function sampleUsSaasRuntimeWatchdog(pool,options={}){
 if(!pool||typeof pool.connect!=="function")throw Error("US_SAAS_WATCHDOG_DB_REQUIRED");
 if(options.expectedMode!==undefined&&!["ACTIVE","HOLD"].includes(options.expectedMode))
   throw Error("US_SAAS_WATCHDOG_MODE_INVALID");
 const db=await pool.connect();
 let begun=false,discard=false;
 try{
   await db.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
   begun=true;
   await db.query("SET LOCAL statement_timeout = '5000ms'");
   await db.query("SET LOCAL lock_timeout = '1000ms'");
   await db.query("SET LOCAL idle_in_transaction_session_timeout = '10000ms'");
   const check=await db.query("SHOW transaction_read_only");
   if(check.rows.length!==1||check.rows[0].transaction_read_only!=="on")
     throw Error("US_SAAS_WATCHDOG_READONLY_REQUIRED");
   const result=await readUsSaasRuntimeWatchdog(db,options);
   await db.query("ROLLBACK");begun=false;
   return result;
 }catch(e){
   discard=true;
   if(begun)try{await db.query("ROLLBACK");}catch{}
   throw e;
 }finally{db.release(discard);}
}
