import {assertUsCommercialWriterReleased} from "../provision/usCommercialWriterRelease.js";
import {readUsSaasProjectionPolicy as readPolicy} from "./usSaasAuthorityReadOnly.js";
// G5-T5: US-only Odoo SaaS entitlement projection on EXISTING Core billing_subscriptions.
// Odoo is the only payment authority. This code NEVER charges a wallet/Stripe.


const TYPE=new Set(["salon","master"]);
const MAX_EVIDENCE_AGE_MS=5*60*1000;
const number=x=>{const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:0;};
function fail(code){const e=new Error(code);e.code=code;e.status=409;return e;}
function date(x){const d=new Date(x);return Number.isFinite(d.getTime())?d:null;}
function DENY(reason,us=true){return Object.freeze({
  managed:us,can_write:false,can_withdraw:false,can_book:false,reason,
  subscription_status:"blocked",access_state:"blocked",
});}
export function readUsSaasProjectionPolicy(env=process.env){
  return readPolicy(env);
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
// 7.03/7.05: decide only ordinary paid refresh/renewal. Restoration is a
// distinct, currently unapproved authority; no caller-supplied flag can release it.
const RECONCILE_STATES=new Set(["activated","email_ready","email_sent","email_failed"]);
const time=v=>v==null||v===""?NaN:new Date(v).getTime();
export function assertUsSaasPaidProjectionTransition(current,request,evidence,now,operation){
  if(operation==="RESTORE")throw fail("US_SAAS_RESTORATION_AUTHORITY_HOLD");
  if(operation!=="INITIAL_ACTIVATION"&&operation!=="RECONCILE")
    throw fail("US_SAAS_PROJECTION_OPERATION_REQUIRED");
  if(request?.owner_type!=="salon"||request.source_namespace!=="odoo_online"||
     Number(request.source_company_id)!==4||Number(request.source_website_id)!==5||
     !number(request.created_owner_id)||!number(request.created_auth_user_id)||
     !number(request.source_partner_id)||
     request.source_request_id!=="odoo-us-partner-"+number(request.source_partner_id))
    throw fail("US_SAAS_PROJECTION_SCOPE_INVALID");
  const start=time(evidence?.periodStartUtc),end=time(evidence?.periodEndExclusiveUtc);
  const observed=time(evidence?.verifiedAtUtc),clock=time(now);
  const order=number(evidence?.subscriptionOrderId),invoice=number(evidence?.invoiceId);
  if(![start,end,observed,clock].every(Number.isFinite)||!(start<=clock&&clock<end)||
     observed>clock+1000||clock-observed>10000||!order||!invoice||
     typeof evidence?.commercialPolicyVersion!=="string"||
     !/^[a-zA-Z0-9_.-]{1,40}$/.test(evidence.commercialPolicyVersion))
    throw fail("US_SAAS_PROJECTION_EVIDENCE_INVALID");
  if(operation==="INITIAL_ACTIVATION"){
    if(request.status!=="provisioned")throw fail("US_SAAS_INITIAL_ACTIVATION_STATE_INVALID");
    if(current)throw fail("US_SAAS_INITIAL_PROJECTION_ALREADY_EXISTS");
    return "INITIAL_ACTIVATION";
  }
  if(!RECONCILE_STATES.has(request.status)||!current||!number(current.id))
    throw fail("US_SAAS_EXISTING_PROJECTION_REQUIRED");
  if(current.owner_type!==request.owner_type||
     number(current.owner_id)!==number(request.created_owner_id)||
     current.provider_namespace!=="odoo_online"||current.wallet_only!==false||
     current.currency!=="USD"||current.billing_model!=="subscription"||
     Number(current.provider_company_id)!==4||Number(current.provider_website_id)!==5||
     number(current.provider_partner_id)!==number(request.source_partner_id)||
     current.provider_source_request_id!==request.source_request_id)
    throw fail("US_SAAS_EXISTING_PROJECTION_SOURCE_CHANGED");
  if(current.subscription_status!=="active"||current.blocked_at!==null||
     current.provider_revoked_at!==null)
    throw fail("US_SAAS_RESTORATION_AUTHORITY_HOLD");
  if(current.provider_policy_version!==evidence.commercialPolicyVersion)
    throw fail("US_SAAS_RENEWAL_POLICY_CHANGED");
  const oldStart=time(current.current_period_start),oldEnd=time(current.current_period_end);
  const oldVerified=time(current.provider_verified_at);
  const oldOrder=number(current.provider_subscription_order_id),oldInvoice=number(current.provider_invoice_id);
  if(![oldStart,oldEnd,oldVerified].every(Number.isFinite)||oldStart>=oldEnd||
     observed<=oldVerified||!oldOrder||!oldInvoice)
    throw fail("US_SAAS_RECONCILIATION_EVIDENCE_STALE");
  // A direct parent pointer is not full canonical agreement-root proof.
  // Hold successor orders until the native lineage contract is accepted.
  if(order!==oldOrder)throw fail("US_SAAS_RENEWAL_LINEAGE_NOT_PROVEN");
  if(start===oldStart&&end===oldEnd&&invoice===oldInvoice)return "REFRESH";
  if(start===oldEnd&&end>oldEnd&&invoice!==oldInvoice)return "RENEWAL";
  throw fail("US_SAAS_RENEWAL_CYCLE_NOT_PROVEN");
}

// Read PostgreSQL wall clock after locks, never reuse the pre-lock snapshot.
export async function readUsSaasTransactionClock(db){
  const q=await db.query("SELECT clock_timestamp() AS now");
  const v=q.rows.length===1?q.rows[0]?.now:null;
  if((typeof v!=="string"&&Object.prototype.toString.call(v)!=="[object Date]")||
     !Number.isFinite(time(v)))throw fail("US_SAAS_TRANSACTION_CLOCK_INVALID");
  return new Date(v);
}
export function usSaasAuditId(value){
  return (typeof value==="number"||
    (typeof value==="string"&&/^[1-9][0-9]*$/.test(value)))?number(value):0;
}
/** Called inside the EXISTING T3 activation or T5 reconciliation transaction. */
export async function persistUsSaasPaidProjection(db,lockedRequest,evidence,now,assertPaidEvidence,{operation}={}){
  assertUsCommercialWriterReleased("projection");
  if(operation==="RESTORE")throw fail("US_SAAS_RESTORATION_AUTHORITY_HOLD");
  if(operation!=="INITIAL_ACTIVATION"&&operation!=="RECONCILE")throw fail("US_SAAS_PROJECTION_OPERATION_REQUIRED");
  // An imported master's membership never creates a separate paid projection.
  // own_salon uses the salon projection; existing_salon needs its own approved
  // commercial model before any independent writer can be enabled.
  if(lockedRequest?.source_namespace==="odoo_online"&&lockedRequest.owner_type==="master")
    throw fail("US_ODOO_MASTER_ROLE_COMMERCIAL_CONTRACT_HOLD");
  if(typeof assertPaidEvidence!=="function")throw fail("US_SAAS_VERIFIED_PROOF_CONTRACT_REQUIRED");
  assertPaidEvidence(lockedRequest,evidence,now);
  if(!TYPE.has(lockedRequest.owner_type))
    throw fail("US_SAAS_ROLE_INVALID");
  const role=lockedRequest.owner_type,id=number(lockedRequest.created_owner_id);
  const old=await db.query(
    "SELECT * FROM public.billing_subscriptions "+
    "WHERE owner_type=$1 AND owner_id=$2 FOR UPDATE",[role,id]);
  if(old.rows.length>1)throw fail("US_SAAS_DUPLICATE_PROJECTIONS");
  const current=old.rows[0]||null;
  const lockedClock=await readUsSaasTransactionClock(db);
  assertPaidEvidence(lockedRequest,evidence,lockedClock);
  const transition=assertUsSaasPaidProjectionTransition(current,lockedRequest,evidence,lockedClock,operation);
  const orderId=number(evidence.subscriptionOrderId);
  const args=[role,id,Number(lockedRequest.source_partner_id),
    lockedRequest.source_request_id,orderId,number(evidence.invoiceId),
    evidence.commercialPolicyVersion,evidence.periodStartUtc,
    evidence.periodEndExclusiveUtc,evidence.verifiedAtUtc];
  if(transition!=="INITIAL_ACTIVATION"){
    const updated=await db.query(
      "UPDATE public.billing_subscriptions SET "+
      "current_period_start=$8::timestamptz,"+
      "current_period_end=$9::timestamptz,provider_verified_at=$10::timestamptz,"+
      "provider_subscription_order_id=$5,provider_invoice_id=$6,"+
      "provider_policy_version=$7,updated_at=NOW() "+
      "WHERE id=$11 AND owner_type=$1 AND owner_id=$2 AND provider_namespace='odoo_online' "+
      "AND provider_company_id=4 AND provider_website_id=5 AND currency='USD' AND wallet_only=false "+
      "AND provider_partner_id=$3 AND provider_source_request_id=$4 "+
      "AND subscription_status='active' AND blocked_at IS NULL AND provider_revoked_at IS NULL "+
      "AND provider_policy_version=$7 AND provider_verified_at<$10::timestamptz "+
      "RETURNING *",[...args,number(current.id)]);
    if(updated.rows.length!==1||number(updated.rows[0].id)!==number(current.id))throw fail("US_SAAS_PROJECTION_UPDATE_RACE");
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
// Negative disposition requires approved cutoff/refund authority. The old
// cancellation/credit-note predicate is not that authority. Retain the export
// as a fail-closed compatibility boundary, without a mutation path.
export async function revokeUsSaasProjection(db,lockedRequest,evidence={}){
  assertUsCommercialWriterReleased("projection");
  throw fail("US_SAAS_REVOCATION_POLICY_HOLD");
}
