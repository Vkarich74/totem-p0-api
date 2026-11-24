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
 count(*) FILTER (WHERE status='pending' AND run_at<=t AT TIME ZONE 'UTC') AS runnable,
 count(*) FILTER (WHERE status='processing') AS processing,
 count(*) FILTER (WHERE status='processing' AND (lease_until IS NULL OR lease_until<=t)) AS lease_expired,
 count(*) FILTER (WHERE status='failed' AND updated_at>= (t AT TIME ZONE 'UTC')-interval '15 minutes') AS recent_failed,
 count(*) FILTER (WHERE status='done' AND updated_at>= (t AT TIME ZONE 'UTC')-interval '15 minutes') AS recent_done,
 max(extract(epoch FROM (t AT TIME ZONE 'UTC')-run_at)) FILTER
 (WHERE status='pending' AND run_at<=t AT TIME ZONE 'UTC') AS oldest_runnable_s
 FROM public.async_jobs CROSS JOIN clock WHERE job_type='us_saas_reconcile'
)
SELECT clock.t AS sampled_at,projection.*,queue.* FROM clock CROSS JOIN projection CROSS JOIN queue
`;
const countKeys=["total","orphaned","due","at_risk","stale","expired_active","active","blocked",
 "pending","runnable","processing","lease_expired","recent_failed","recent_done"];
function number(value){if(value===null||value===undefined||value==="")throw Error("US_SAAS_MONITOR_INVALID");const n=Number(value);
 if(!Number.isSafeInteger(n)||n<0)throw Error("US_SAAS_MONITOR_INVALID");return n;}
function age(value){if(value===null)return null;const n=Number(value);if(!Number.isFinite(n))throw Error("US_SAAS_MONITOR_INVALID");return Math.round(n*1000)/1000;}
export async function readUsSaasRuntimeHealth(db){
 const {rows}=await db.query(US_SAAS_RUNTIME_HEALTH_SQL);
 if(rows.length!==1)throw Error("US_SAAS_MONITOR_INVALID");
 const row=rows[0],time=new Date(row.sampled_at);
 if(!Number.isFinite(time.getTime()))throw Error("US_SAAS_MONITOR_INVALID");
 const result={sampled_at:time.toISOString()};
 for(const k of countKeys)result[k]=number(row[k]);
 result.max_active_age_s=age(row.max_active_age_s);
 result.oldest_runnable_s=age(row.oldest_runnable_s);
 result.severity=result.stale||result.orphaned||result.expired_active?"CRITICAL":
   result.at_risk||result.lease_expired||result.recent_failed||
   (result.oldest_runnable_s??0)>60?"WARN":"OK";
 return Object.freeze(result);
}
