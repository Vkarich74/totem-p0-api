// Fixed system principal for the existing public.audit_events table.
// Schema evidence: 2026-11-16 production schema-only snapshot (core_user_id nullable).
// The audit is part of the SAME caller transaction; never silently swallow failure.
export const US_SAAS_SYSTEM_ACTOR = Object.freeze({actor:"system:us_saas_reconciliation"});
const EVENTS = new Set(["owner_opening.odoo_paid_entitlement_reconciled","owner_opening.odoo_entitlement_revoked"]);
function invalid(){const e=new Error("US_SAAS_SYSTEM_AUDIT_CONTRACT_INVALID");e.code=e.message;return e;}
const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):0;
export async function writeSystemUsSaasReconciliationAudit(db,{request,admin,eventType,data={}}={}){
  if(!db||typeof db.query!=="function"||admin?.actor!==US_SAAS_SYSTEM_ACTOR.actor||
     admin.id!=null||admin.email!=null||!EVENTS.has(eventType)||!id(request?.id)||
     !["salon","master"].includes(request?.owner_type)||request?.source_namespace!=="odoo_online"||
     Number(request.source_company_id)!==4||Number(request.source_website_id)!==5)throw invalid();
  const payload={entity_type:"owner_opening_request",entity_id:id(request.id),
    request_id:id(request.id),owner_type:request.owner_type,status:request.status};
  if(eventType==="owner_opening.odoo_paid_entitlement_reconciled"){
    if(!id(data.billing_id)||!id(data.subscription_order_id)||!id(data.invoice_id)||
      typeof data.commercial_policy_version!=="string"||
      !/^[A-Za-z0-9_.-]{1,40}$/.test(data.commercial_policy_version)||
      typeof data.effective_until!=="string"||!Number.isFinite(Date.parse(data.effective_until)))throw invalid();
    Object.assign(payload,{billing_id:id(data.billing_id),subscription_order_id:id(data.subscription_order_id),
      invoice_id:id(data.invoice_id),effective_until:data.effective_until,
      commercial_policy_version:data.commercial_policy_version});
  }else{
    if(typeof data.reason!=="string"||!/^ODOO_[A-Z0-9_]{1,75}$/.test(data.reason))throw invalid();
    payload.reason=data.reason;
  }
  const r=await db.query("INSERT INTO public.audit_events(event_type,actor,core_user_id,data) VALUES($1,$2,NULL,$3::jsonb) RETURNING id",
    [eventType,US_SAAS_SYSTEM_ACTOR.actor,JSON.stringify(payload)]);
  if(r.rows.length!==1)throw invalid();
  return r.rows[0];
}
