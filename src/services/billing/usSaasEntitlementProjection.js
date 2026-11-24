import {assertUsCommercialWriterReleased} from "../provision/usCommercialWriterRelease.js";
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
  return DENY("US_SAAS_PROJECTION_RELEASE_HOLD");
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
/** Load trusted Core source and market, never trust req.body or user JWT market. */
// lock=true is ONLY for a transaction client. Reconciliation updates the
// same source and billing rows; SHARE locks serialize a commercial write
// with verified provider revocation. Re-read the database clock at commit.
export async function getUsSaasAccess(db,{ownerType,ownerId,policy=null,now=new Date(),lock=false}={}){
  if(!TYPE.has(ownerType)||!number(ownerId))throw fail("US_SAAS_OWNER_INVALID");
  const id=number(ownerId);
  const sourceRows=await db.query(
    "SELECT id,status,source_namespace,source_company_id,source_website_id,"+
    "source_partner_id,source_request_id FROM public.owner_opening_requests "+
    "WHERE owner_type=$1 AND created_owner_id=$2 "+
    "AND source_namespace='odoo_online' ORDER BY id DESC LIMIT 2"+(lock?" FOR SHARE":""),[ownerType,id]);
  if(sourceRows.rows.length>1)return DENY("US_SAAS_DUPLICATE_OWNER_SOURCES");
  const source=sourceRows.rows[0]||null;
  const marketSql=ownerType==="salon"?
    "SELECT EXISTS (SELECT 1 FROM public.tenant_market_settings t "+
      "JOIN public.markets mk ON mk.id=t.market_id "+
      "WHERE t.salon_id=$1 AND mk.code='US') AS us":
    "SELECT EXISTS (SELECT 1 FROM public.master_salon ms "+
      "JOIN public.tenant_market_settings t ON t.salon_id=ms.salon_id "+
      "JOIN public.markets mk ON mk.id=t.market_id "+
      "WHERE ms.master_id=$1 AND mk.code='US') AS us";
  const market=await db.query(marketSql,[id]);
  const marketUs=market.rows[0]?.us===true;
  const rows=await db.query(
    "SELECT * FROM public.billing_subscriptions "+
    "WHERE owner_type=$1 AND owner_id=$2 LIMIT 2"+(lock?" FOR SHARE":""),[ownerType,id]);
  if(rows.rows.length>1)return DENY("US_SAAS_DUPLICATE_PROJECTIONS");
  const row=rows.rows[0]||null;
  if(!marketUs&&!source&&row?.provider_namespace!=="odoo_online")
    return {managed:false};
  // Database clock is authoritative at the exact commercial operation.
  const clock=await db.query("SELECT clock_timestamp() AS now");
  return assessUsSaasProjection(row,{
    marketUs,source,now:clock.rows[0]?.now,policy,
  });
}
/** Called inside the EXISTING T3 activation transaction, after FOR UPDATE source. */
export async function persistUsSaasPaidProjection(db,lockedRequest,evidence,now,assertPaidEvidence){
  assertUsCommercialWriterReleased("projection");
  if(typeof assertPaidEvidence!=="function")throw fail("US_SAAS_VERIFIED_PROOF_CONTRACT_REQUIRED");
  assertPaidEvidence(lockedRequest,evidence,now);
  if(!TYPE.has(lockedRequest.owner_type))
    throw fail("US_SAAS_ROLE_INVALID");
  const role=lockedRequest.owner_type,id=number(lockedRequest.created_owner_id);
  const old=await db.query(
    "SELECT * FROM public.billing_subscriptions "+
    "WHERE owner_type=$1 AND owner_id=$2 FOR UPDATE",[role,id]);
  const current=old.rows[0]||null;
  if(current&&current.provider_namespace!=="odoo_online")
    throw fail("US_SAAS_LEGACY_BILLING_TAKEOVER_FORBIDDEN");
  if(current&&(Number(current.provider_partner_id)!==
       Number(lockedRequest.source_partner_id)||
       current.provider_source_request_id!==lockedRequest.source_request_id||
       Number(current.provider_company_id)!==4||
       Number(current.provider_website_id)!==5))
    throw fail("US_SAAS_EXISTING_PROJECTION_SOURCE_CHANGED");
  const orderId=number(evidence.subscriptionOrderId);
  if(current&&Number(current.provider_subscription_order_id)!==orderId){
    // New subscription order must be authenticated against a linked parent
    // via Odoo readback. A foreign order belonging to the same partner
    // may never be used to extend somebody else's Core entitlement.
    if(Number(evidence.renewedFromOrderId)!==
       Number(current.provider_subscription_order_id)||
       !number(evidence.renewedFromOrderId)){
      throw fail("US_SAAS_RENEWAL_LINEAGE_NOT_PROVEN");
    }
  }
  const args=[role,id,Number(lockedRequest.source_partner_id),
    lockedRequest.source_request_id,orderId,number(evidence.invoiceId),
    evidence.commercialPolicyVersion,evidence.periodStartUtc,
    evidence.periodEndExclusiveUtc,evidence.verifiedAtUtc];
  if(current){
    const updated=await db.query(
      "UPDATE public.billing_subscriptions SET "+
      "subscription_status='active',blocked_at=NULL,"+
      "provider_revoked_at=NULL,current_period_start=$8::timestamptz,"+
      "current_period_end=$9::timestamptz,provider_verified_at=$10::timestamptz,"+
      "provider_subscription_order_id=$5,provider_invoice_id=$6,"+
      "provider_policy_version=$7,updated_at=NOW() "+
      "WHERE owner_type=$1 AND owner_id=$2 AND provider_namespace='odoo_online' "+
      "AND provider_partner_id=$3 AND provider_source_request_id=$4 "+
      "RETURNING *",args);
    if(updated.rows.length!==1)throw fail("US_SAAS_PROJECTION_UPDATE_RACE");
    return updated.rows[0];
  }
  const added=await db.query(
    "INSERT INTO public.billing_subscriptions "+
    "(owner_type,owner_id,billing_model,subscription_status,"+
    "subscription_period_days,amount,currency,wallet_only,"+
    "current_period_start,current_period_end,grace_period_days,grace_until,"+
    "provider_namespace,provider_company_id,provider_website_id,"+
    "provider_partner_id,provider_source_request_id,"+
    "provider_subscription_order_id,provider_invoice_id,"+
    "provider_policy_version,provider_verified_at,provider_revoked_at,"+
    "created_at,updated_at) "+
    "VALUES($1,$2,'subscription','active',30,0,'USD',FALSE,"+
    "$8::timestamptz,$9::timestamptz,0,NULL,"+
    "'odoo_online',4,5,$3,$4,$5,$6,$7,$10::timestamptz,NULL,NOW(),NOW()) "+
    "RETURNING *",args);
  if(added.rows.length!==1)throw fail("US_SAAS_PROJECTION_INSERT_FAILED");
  return added.rows[0];
}
export async function revokeUsSaasProjection(db,lockedRequest,{reason,verifiedAtUtc}={}){
  assertUsCommercialWriterReleased("projection");
  if(!REVOKE_REASONS.has(reason))throw fail("US_SAAS_REVOCATION_NOT_PROVEN");
  if(lockedRequest?.source_namespace!=="odoo_online"||
     Number(lockedRequest.source_company_id)!==4)
    throw fail("US_SAAS_REVOCATION_SOURCE_INVALID");
  const verified=date(verifiedAtUtc);
  if(!verified)throw fail("US_SAAS_REVOCATION_CLOCK_INVALID");
  const r=await db.query(
    "UPDATE public.billing_subscriptions SET "+
    "subscription_status='blocked',blocked_at=NOW(),"+
    "provider_revoked_at=$3::timestamptz,provider_verified_at=$3::timestamptz,"+
    "updated_at=NOW() WHERE owner_type=$1 AND owner_id=$2 "+
    "AND provider_namespace='odoo_online' AND provider_source_request_id=$4 "+
    "RETURNING id",[lockedRequest.owner_type,lockedRequest.created_owner_id,
      verified.toISOString(),lockedRequest.source_request_id]);
  return r.rows.length===1;
}
