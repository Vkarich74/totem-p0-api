// G5-T5: US-only Odoo SaaS entitlement projection on EXISTING Core billing_subscriptions.
// Odoo is the only payment authority. This code NEVER charges a wallet/Stripe.


const TYPE=new Set(["salon","master"]);
const MAX_EVIDENCE_AGE_MS=5*60*1000;
const REVOKE_REASONS=new Set([
  "ODOO_INVOICE_REVERSED","ODOO_SUBSCRIPTION_NOT_ELIGIBLE",
  "ODOO_PAID_INVOICE_NOT_FOUND","ODOO_PAID_PERIOD_NOT_CURRENT",
  "ODOO_INVOICE_SCOPE_MISMATCH","ODOO_SUBSCRIPTION_SCOPE_MISMATCH",
]);
const number=x=>{const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:0;};
function fail(code){const e=new Error(code);e.code=code;e.status=409;return e;}
function date(x){const d=new Date(x);return Number.isFinite(d.getTime())?d:null;}
function DENY(reason,us=true){return Object.freeze({
  managed:us,can_write:false,can_withdraw:false,can_book:false,reason,
  subscription_status:"blocked",access_state:"blocked",
});}
export function readUsSaasProjectionPolicy(env=process.env){
  if(env.TOTEM_US_ODOO_SAAS_ACCESS_ENABLED!=="true")return null;
  let x;
  try{x=JSON.parse(env.TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON||"");}catch{return null;}
  if(x?.approved!==true||typeof x.version!=="string"||!/^[a-zA-Z0-9_.-]{1,40}$/.test(x.version))
    return null;
  return {version:x.version,maxEvidenceAgeMs:MAX_EVIDENCE_AGE_MS};
}
export function assessUsSaasProjection(row,{marketUs=false,source=null,
  now=new Date(),policy=null}={}){
  if(!marketUs&&!source&&row?.provider_namespace!=="odoo_online"){
    return {managed:false};
  }
  const clock=date(now);
  if(!clock)return DENY("US_SAAS_CLOCK_INVALID");
  if(!source||source.source_namespace!=="odoo_online"||
     Number(source.source_company_id)!==4||Number(source.source_website_id)!==5)
    return DENY("US_SAAS_TRUSTED_OWNER_SOURCE_MISSING");
  if(!row||row.provider_namespace!=="odoo_online"||row.wallet_only!==false||
     row.currency!=="USD"||Number(row.provider_company_id)!==4||
     Number(row.provider_website_id)!==5||
     Number(row.provider_partner_id)!==Number(source.source_partner_id)||
     String(row.provider_source_request_id)!==String(source.source_request_id)||
     !number(row.provider_subscription_order_id)||!number(row.provider_invoice_id))
    return DENY("US_SAAS_PROJECTION_MISSING_OR_MISMATCH");
  if(!policy||row.provider_policy_version!==policy.version||
     !Number.isSafeInteger(policy.maxEvidenceAgeMs)||
     policy.maxEvidenceAgeMs<1||policy.maxEvidenceAgeMs>MAX_EVIDENCE_AGE_MS)
    return DENY("US_SAAS_COMMERCIAL_POLICY_UNAPPROVED");
  if(source.status!=="activated"&&source.status!=="email_ready"&&
     source.status!=="email_sent"&&source.status!=="email_failed")
    return DENY("US_SAAS_CORE_NOT_ACTIVATED");
  if(row.subscription_status!=="active"||row.blocked_at||row.provider_revoked_at)
    return DENY("US_SAAS_REVOKED_OR_BLOCKED");
  const start=date(row.current_period_start),end=date(row.current_period_end);
  if(!start||!end||start.getTime()>clock.getTime()||
      clock.getTime()>=end.getTime())
    return DENY("US_SAAS_PAID_PERIOD_EXPIRED_OR_NOT_STARTED");
  const checked=date(row.provider_verified_at);
  if(!checked||checked.getTime()>clock.getTime()+1000||
      clock.getTime()-checked.getTime()>policy.maxEvidenceAgeMs)
    return DENY("US_SAAS_EVIDENCE_STALE");
  return Object.freeze({
    managed:true,can_write:true,can_book:true,can_withdraw:true,
    subscription_status:"active",access_state:"active",
    paid_until:end.toISOString(),verified_at:checked.toISOString(),
    subscription_order_id:Number(row.provider_subscription_order_id),
  });
}
