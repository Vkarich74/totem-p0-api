// US G3 manual release contract. This module performs read-only readiness checks.
// Commercial activation and welcome remain hard-disabled until the separately
// approved Odoo paid-proof/projection transaction is installed. No env override.
import {isScopedUsOdooRequest} from "./usG3ManualRequestReceipt.js";
import {validG3Seal,sameG3Seal} from "./usOdooG3SealProof.js";
import {assertUsSalonLocationReady} from "./usOpenOwnerGuards.js";
const states=new Set(["activated","email_ready","email_sent","email_failed"]);
const id=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
const fail=code=>Object.assign(Error(code),{code,status:409});
const proof=r=>r?.precheck_result_json?.odoo_source_proof;
export function usManualReleaseHold(r,operation){
 if(!isScopedUsOdooRequest(r))return null;
 if(operation==="activate")return "US_G3_COMMERCIAL_ACTIVATION_RELEASE_HOLD";
 if(["preview","send","resend"].includes(operation))return "US_G3_WELCOME_RELEASE_HOLD";
 throw fail("US_G3_MANUAL_RELEASE_OPERATION_INVALID");
}
export function welcomeIntentKey(v){
 const n=id(v);if(!n)throw fail("OWNER_OPENING_REQUEST_ID_INVALID");
 return "owner_opening:"+n+":welcome:v1";
}
export function welcomeRfcMessageId(v){
 const n=id(v);if(!n)throw fail("OWNER_OPENING_REQUEST_ID_INVALID");
 return "<totem-owner-opening-"+n+"-welcome-v1@totemv.com>";
}
function exactSource(r){
 const p=proof(r),mode=p?.entry_mode;
 return isScopedUsOdooRequest(r)&&Number(r.source_company_id)===4&&Number(r.source_website_id)===5&&
 r.precheck_result_json?.normalized?.market_code==="US"&&id(r.source_partner_id)>0&&
 r.source_request_id==="odoo-us-partner-"+r.source_partner_id&&p?.source_request_id===r.source_request_id&&
 Number(p.source_partner_id)===Number(r.source_partner_id)&&p.source_stage_id===82&&
 p.source==="odoo_us_approved_profile_v1"&&p.source_marker==="totem_us_portal_approved_v1"&&validG3Seal(p)&&
 ((r.owner_type==="salon"&&((mode==="salon"&&p.role_set==="salon")||(mode==="own_salon"&&p.role_set==="salon,master")))||
  (r.owner_type==="master"&&((mode==="existing_salon"&&p.role_set==="master")||(mode==="own_salon"&&p.role_set==="salon,master"))));
}
// A persisted message is not proof of delivery. A missing Gmail acknowledgement
// or legacy/ambiguous intent must never be treated as permission to retry.
export function classifyWelcomeIntent(r,rows){
 const key=welcomeIntentKey(r.id);
 if(!Array.isArray(rows))return "RECONCILIATION_REQUIRED";
 if(!rows.length)return r.message_id==null&&!r.email_sent_at&&r.status!=="email_sent"&&r.status!=="email_failed"&&!["sent","failed"].includes(r.email_status)?"NOT_CLAIMED":"RECONCILIATION_REQUIRED";
 if(rows.length!==1)return "RECONCILIATION_REQUIRED";
 const m=rows[0];
 if(!id(m.id)||id(r.message_id)!==id(m.id)||m.idempotency_key!==key||
 m.rfc_message_id!==welcomeRfcMessageId(r.id)||m.logical_intent_key!==key)return "RECONCILIATION_REQUIRED";
 if(m.status==="sent"&&m.delivery_state==="sent"&&r.status==="email_sent"&&r.email_status==="sent"&&r.email_sent_at&&m.has_provider_id===true)return "SENT_RECORDED";
 return "RECONCILIATION_REQUIRED";
}
async function inspectCanonical(db,r){
 if(!id(r.created_owner_id)||!id(r.created_auth_user_id)||!["provisioned",...states].includes(r.status))return {identity:false,geo:false,reason:"PROVISION_REQUIRED"};
 const active=states.has(r.status),mode=proof(r)?.entry_mode;
 let salonId;
 if(r.owner_type==="salon"){
  const q=await db.query(`SELECT s.id FROM public.salons s
   JOIN public.auth_users a ON a.id=$2
   JOIN public.owner_salon os ON os.salon_id=s.id AND os.owner_id=a.id::text
   JOIN public.tenant_market_settings t ON t.salon_id=s.id JOIN public.markets m ON m.id=t.market_id
   WHERE s.id=$1 AND s.slug=$3 AND s.status=$4 AND a.role='salon_admin' AND a.enabled=$5
   AND ($5=false OR s.enabled=true) AND a.salon_id=s.id::text AND a.salon_slug=s.slug
   AND a.master_slug IS NULL AND a.master_id IS NULL AND lower(a.email)=lower($6) AND a.phone=$7
   AND os.status='active' AND m.code='US' AND m.country_code='US' AND m.active=true
   AND COALESCE(t.currency_override,m.default_currency)='USD'
   AND (SELECT count(*) FROM public.owner_salon x WHERE x.salon_id=s.id)=1`,
   [r.created_owner_id,r.created_auth_user_id,r.slug_final,active?"active":"draft",active,r.email,r.phone_normalized]);
  if(q.rows.length!==1)return {identity:false,geo:false,reason:"CANONICAL_SALON_IDENTITY_MISMATCH"};
  salonId=id(q.rows[0].id);
 }else if(r.owner_type==="master"){
  const q=await db.query(`SELECT s.id AS salon_id,a.role,a.enabled,a.master_id,a.master_slug,a.salon_id,a.salon_slug,
    (a.email_verified_at IS NOT NULL) AS email_verified
   FROM public.masters ma JOIN public.auth_users a ON a.id=ma.user_id
   JOIN public.master_salon ms ON ms.master_id=ma.id JOIN public.salons s ON s.id=ms.salon_id
   JOIN public.tenant_market_settings t ON t.salon_id=s.id JOIN public.markets m ON m.id=t.market_id
   WHERE ma.id=$1 AND a.id=$2 AND ma.slug=$3 AND ma.active=$4 AND s.slug=$5
   AND lower(a.email)=lower($6) AND a.phone=$7 AND s.enabled=true AND s.status='active' AND ms.status='active'
   AND m.code='US' AND m.country_code='US' AND m.active=true AND COALESCE(t.currency_override,m.default_currency)='USD'
   AND (SELECT count(*) FROM public.master_salon x WHERE x.master_id=ma.id)=1`,
   [r.created_owner_id,r.created_auth_user_id,r.slug_final,active,r.salon_slug,r.email,r.phone_normalized]);
  if(q.rows.length!==1)return {identity:false,geo:false,reason:"CANONICAL_MASTER_RELATION_MISMATCH"};
  const a=q.rows[0];salonId=id(a.salon_id);
  if(mode==="own_salon"){
   if(a.role!=="salon_admin"||a.enabled!==true||!a.email_verified||a.master_id!==null||a.master_slug!==null||
    id(a.salon_id)!==salonId||a.salon_slug!==r.salon_slug)return {identity:false,geo:false,reason:"SHARED_PRINCIPAL_MISMATCH"};
   const parent=await db.query(`SELECT o.precheck_result_json FROM public.owner_opening_requests o
    JOIN public.owner_salon os ON os.salon_id=o.created_owner_id AND os.owner_id=o.created_auth_user_id::text
    WHERE o.owner_type='salon' AND o.source_namespace='odoo_online' AND o.source_company_id=4 AND o.source_website_id=5
    AND o.source_partner_id=$1 AND o.source_request_id=$2 AND o.created_owner_id=$3 AND o.created_auth_user_id=$4
    AND o.status IN ('activated','email_ready','email_sent','email_failed') AND os.status='active'`,
    [r.source_partner_id,r.source_request_id,salonId,r.created_auth_user_id]);
   const p=parent.rows[0]?.precheck_result_json?.odoo_source_proof;
   if(parent.rows.length!==1||p?.entry_mode!=="own_salon"||p.role_set!=="salon,master"||
    p.odoo_lead_id!==proof(r).odoo_lead_id||!sameG3Seal(p,proof(r)))return {identity:false,geo:false,reason:"SHARED_PARENT_SOURCE_MISMATCH"};
  }else if(mode==="existing_salon"){
   if(a.role!=="master"||a.enabled!==active||id(a.master_id)!==id(r.created_owner_id)||a.master_slug!==r.slug_final)
    return {identity:false,geo:false,reason:"MASTER_IDENTITY_MISMATCH"};
  }else return {identity:false,geo:false,reason:"ROLE_MODE_INVALID"};
 }else return {identity:false,geo:false,reason:"ROLE_MODE_INVALID"};
 if(!salonId)return {identity:false,geo:false,reason:"SALON_ID_INVALID"};
 try{await assertUsSalonLocationReady(db,salonId);}
 catch(e){if(e?.code!=="US_LOCATION_NOT_READY")throw e;return {identity:true,geo:false,reason:"US_LOCATION_NOT_READY"};}
 return {identity:true,geo:true,reason:"CANONICAL_AND_GEO_READBACK_PASS"};
}
export async function inspectUsManualActivationWelcome(pool,request){
 if(!isScopedUsOdooRequest(request))return null;
 const base={contract:"us_g3_manual_activation_welcome_v1",activation:"HOLD",welcome:"HOLD",
  activation_allowed:false,welcome_allowed:false,automatic_retry_allowed:false,
  paid_authority:"NOT_INSTALLED",commercial_projection_required:true,
  owner_mode:proof(request)?.entry_mode??null,
  credential_mode:request.owner_type==="master"&&proof(request)?.entry_mode==="own_salon"?"existing_salon_principal":"role_specific",
  fresh_source_and_admin_recheck_required:true,owner_consent_recheck_required:proof(request)?.entry_mode==="existing_salon",
  source_seal_valid:false,canonical_identity_ready:false,geo_ready:false,welcome_intent:"UNVERIFIED"};
 let db;
 try{
  db=await pool.connect();
  await db.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const q=await db.query("SELECT * FROM public.owner_opening_requests WHERE id=$1",[request.id]);
  const r=q.rows[0];
  if(q.rows.length!==1||!isScopedUsOdooRequest(r))throw fail("US_G3_RELEASE_READBACK_CHANGED");
  const source=exactSource(r);
  const c=source?await inspectCanonical(db,r):{identity:false,geo:false,reason:"SOURCE_SEAL_OR_SCOPE_UNVERIFIED"};
  const m=await db.query(`SELECT id,status,idempotency_key,data->>'rfc_message_id' AS rfc_message_id,
    data->>'logical_intent_key' AS logical_intent_key,data->>'delivery_state' AS delivery_state,
    COALESCE((data->>'gmail_message_id') ~ '^[a-zA-Z0-9_-]{1,200}$',false) AS has_provider_id
   FROM public.messages WHERE idempotency_key LIKE $1 ORDER BY id LIMIT 2`,["owner_opening:"+id(r.id)+":%"]);
  const result={...base,owner_mode:proof(r)?.entry_mode??null,source_seal_valid:source,
    canonical_identity_ready:c.identity,geo_ready:c.geo,technical_reason:c.reason,
    welcome_intent:classifyWelcomeIntent(r,m.rows),welcome_intent_key:welcomeIntentKey(r.id),
    welcome_rfc_message_id:welcomeRfcMessageId(r.id)};
  await db.query("COMMIT");
  return result;
 }catch(e){if(db)await db.query("ROLLBACK").catch(()=>{});return {...base,technical_reason:"US_G3_RELEASE_READBACK_UNAVAILABLE"};}
 finally{if(db)db.release();}
}
