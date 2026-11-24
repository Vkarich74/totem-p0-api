// G5-T5: verified Odoo readback updates EXISTING Core billing projection.
// No account creation, new provisioning, reactivation, wallet debit or welcome.
// Intended as a handler for the EXISTING async_jobs; NOT auto-started.
import { prepareUsPaidActivationEvidence } from
  "../provision/usPaidOwnerOpeningGate.js";
import { assertUsPaidEvidenceForLockedRequest } from
  "../provision/ownerOpeningCanonicalActivation.js";
import { persistUsSaasPaidProjection,revokeUsSaasProjection } from
  "./usSaasEntitlementProjection.js";

const positive=x=>{const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:0;};
const CURRENT=new Set(["activated","email_ready","email_failed","email_sent"]);
const REVOKED=new Set([
  "ODOO_INVOICE_REVERSED","ODOO_SUBSCRIPTION_NOT_ELIGIBLE",
  "ODOO_PAID_INVOICE_NOT_FOUND","ODOO_PAID_PERIOD_NOT_CURRENT",
  "ODOO_INVOICE_SCOPE_MISMATCH","ODOO_SUBSCRIPTION_SCOPE_MISMATCH",
]);
function err(code){const e=new Error(code);e.code=code;e.status=409;return e;}
function equalSource(a,b){
  return a&&b&&Number(a.id)===Number(b.id)&&
    a.owner_type===b.owner_type&&
    Number(a.created_owner_id)===Number(b.created_owner_id)&&
    Number(a.created_auth_user_id)===Number(b.created_auth_user_id)&&
    a.source_namespace==="odoo_online"&&
    a.source_request_id===b.source_request_id&&
    Number(a.source_partner_id)===Number(b.source_partner_id)&&
    Number(a.source_company_id)===4&&Number(a.source_website_id)===5;
}
export async function reconcileUsSaasOpening({
  pool,requestId,readback=prepareUsPaidActivationEvidence,
  writeAudit,operator={id:0},
}={}){
  if(!pool||typeof pool.connect!=="function"||!positive(requestId)||
     typeof readback!=="function"||typeof writeAudit!=="function")
    throw err("US_SAAS_RECONCILIATION_CONTRACT_INVALID");
  // Provider network access MUST finish before the SQL lock/transaction.
  const pre=await pool.query(
    "SELECT * FROM public.owner_opening_requests WHERE id=$1",
    [positive(requestId)]);
  const snapshot=pre.rows[0];
  if(!snapshot||snapshot.source_namespace!=="odoo_online"||
     !CURRENT.has(snapshot.status))
    return {status:"WAIT",reason:"US_SAAS_ACTIVE_SOURCE_REQUIRED"};
  let result;
  try{result=await readback(snapshot);}catch{
    return {status:"WAIT",reason:"ODOO_READBACK_UNAVAILABLE"};
  }
  const paid=result?.status==="PAID_VERIFIED"&&result.canActivate===true;
  const definitive=!paid&&REVOKED.has(result?.reason);
  if(!paid&&!definitive)
    return {status:"WAIT",reason:result?.reason||"ODOO_READBACK_UNAVAILABLE"};

  const db=await pool.connect();
  try{
    await db.query("BEGIN");
    const locked=await db.query(
      "SELECT * FROM public.owner_opening_requests WHERE id=$1 FOR UPDATE",
      [positive(requestId)]);
    const request=locked.rows[0];
    if(!equalSource(request,snapshot)||!CURRENT.has(request.status))
      throw err("US_SAAS_RECONCILIATION_SOURCE_CHANGED");
    if(paid){
      const now=await db.query("SELECT clock_timestamp() AS now");
      const billing=await persistUsSaasPaidProjection(
        db,request,result,now.rows[0]?.now,
        assertUsPaidEvidenceForLockedRequest);
      const audit=await writeAudit(db,{request,admin:operator,
        eventType:"owner_opening.odoo_paid_entitlement_reconciled",
        data:{billing_id:Number(billing.id),
          subscription_order_id:positive(result.subscriptionOrderId),
          invoice_id:positive(result.invoiceId),
          effective_until:result.periodEndExclusiveUtc,
          commercial_policy_version:result.commercialPolicyVersion}});
      await db.query("COMMIT");
      return {status:"PAID_VERIFIED",ownerId:Number(request.created_owner_id),
        ownerType:request.owner_type,renewed:true,
        periodEndExclusiveUtc:result.periodEndExclusiveUtc,
        audit_event_id:audit?.id||null};
    }
    // A definitive refund/cancellation/churn state is rechecked via T2.
    // API errors/unknown states are NOT treated as authoritative revocation;
    // the per-operation verified-at TTL will fail closed if stale.
    const now=await db.query("SELECT clock_timestamp() AS now");
    const applied=await revokeUsSaasProjection(db,request,{
      reason:result.reason,verifiedAtUtc:now.rows[0]?.now});
    if(!applied)throw err("US_SAAS_REVOKE_PROJECTION_MISSING");
    await writeAudit(db,{request,admin:operator,
      eventType:"owner_opening.odoo_entitlement_revoked",
      data:{reason:result.reason}});
    await db.query("COMMIT");
    return {status:"REVOKED",ownerType:request.owner_type,
      ownerId:Number(request.created_owner_id),reason:result.reason};
  }catch(e){
    await db.query("ROLLBACK").catch(()=>{});
    throw e;
  }finally{db.release();}
}
export async function findUsSaasReconciliationCandidates(db,{limit=25}={}){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw err("US_SAAS_RECON_LIMIT_INVALID");
  const rows=await db.query(
    "SELECT req.id AS request_id FROM public.billing_subscriptions billing "+
    "JOIN public.owner_opening_requests req "+
    "ON req.owner_type=billing.owner_type "+
    "AND req.created_owner_id=billing.owner_id "+
    "AND req.source_namespace='odoo_online' "+
    "AND req.source_request_id=billing.provider_source_request_id "+
    "WHERE billing.provider_namespace='odoo_online' "+
    "AND (billing.provider_verified_at IS NULL "+
    "OR billing.provider_verified_at < clock_timestamp() - interval '1 minute' "+
    "OR billing.current_period_end <= clock_timestamp()) "+
    "ORDER BY billing.provider_verified_at NULLS FIRST,billing.id "+
    "LIMIT $1",[limit]);
  return rows.rows.map(x=>Number(x.request_id));
}
