// G5: authority proofs for existing role-scoped Owner Opening rows.
// No account creation, payment, session issuance, membership or activation.
// Current role-specific authentication must not be bypassed.
import {createHash} from "node:crypto";
import {assessUsSaasProjection,readUsSaasProjectionPolicy} from "../billing/usSaasEntitlementProjection.js";
const id=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
const fail=(code,status=409)=>Object.assign(Error(code),{code,status});
const activeStates=["activated","email_ready","email_sent","email_failed"];
const sameId=(a,b)=>id(a)>0&&id(a)===id(b);
const provenance=r=>r?.precheck_result_json?.odoo_source_proof;
function source(r,role,mode){
 const p=provenance(r);
 if(r?.owner_type!==role||r.source_namespace!=="odoo_online"||
   Number(r.source_company_id)!==4||Number(r.source_website_id)!==5||!id(r.source_partner_id)||
   r.source_request_id!=="odoo-us-partner-"+r.source_partner_id||
   p?.entry_mode!==mode||p.source_request_id!==r.source_request_id||
   !sameId(p.source_partner_id,r.source_partner_id)||!id(p.odoo_lead_id)||
   p.source_stage_id!==82||p.source_marker!=="totem_us_portal_approved_v1"||
   !p.profile_write_date||!p.lead_write_date||
   (r.precheck_result_json?.normalized?.market_code||r.precheck_result_json?.market_code)!=="US")
   throw fail("US_MASTER_SOURCE_AUTHORITY_REQUIRED");
 return p;
}
function fingerprint(r){
 const p=source(r,"master","existing_salon");
 return createHash("sha256").update(JSON.stringify([
  String(r.id),r.source_request_id,String(r.source_partner_id),p.odoo_lead_id,
  p.profile_write_date,p.lead_write_date,p.target_salon_partner_id,p.target_salon_slug,
  p.target_salon_write_date,r.salon_slug,r.slug_final,r.name,r.specialization,r.email,r.phone_normalized,
 ])).digest("hex");
}
async function one(db,sql,args,code="US_MASTER_AUTHORITY_REQUIRED"){
 const x=await db.query(sql,args);
 if(x.rows.length!==1)throw fail(code);
 return x.rows[0];
}
async function lockedRequest(db,requestId){
 if(!id(requestId))throw fail("US_MASTER_REQUEST_INVALID",400);
 return one(db,"SELECT * FROM public.owner_opening_requests WHERE id=$1 FOR UPDATE",[id(requestId)],"US_MASTER_REQUEST_NOT_FOUND");
}
// Lock exact direct owner, target business and market. Do not use req.identity:
// legacy identity includes indirect master -> salon membership.
async function targetOwner(db,r){
 const p=source(r,"master","existing_salon");
 if(!id(p.target_salon_partner_id)||sameId(p.target_salon_partner_id,r.source_partner_id)||
    p.target_salon_slug!==r.salon_slug||!p.target_salon_write_date)
   throw fail("US_MASTER_TARGET_CHANGED");
 const target=await one(db,`SELECT s.id AS salon_id,a.id AS auth_user_id,o.id AS target_request_id,
   o.source_partner_id,o.precheck_result_json
 FROM public.owner_opening_requests o
 JOIN public.salons s ON s.id=o.created_owner_id
 JOIN public.auth_users a ON a.id=o.created_auth_user_id
 JOIN public.owner_salon os ON os.salon_id=s.id AND os.owner_id=a.id::text
 JOIN public.tenant_market_settings t ON t.salon_id=s.id
 JOIN public.markets m ON m.id=t.market_id
 WHERE o.owner_type='salon' AND o.source_namespace='odoo_online'
   AND o.source_company_id=4 AND o.source_website_id=5
   AND o.source_partner_id=$1 AND o.source_request_id=$2
   AND o.status=ANY($3::text[]) AND s.slug=$4 AND s.enabled=true AND s.status='active'
   AND a.enabled=true AND a.role='salon_admin' AND a.salon_slug=s.slug
   AND a.salon_id=s.id::text AND os.status='active'
   AND m.code='US' AND m.country_code='US' AND m.active=true
   AND COALESCE(t.currency_override,m.default_currency)='USD'
 FOR UPDATE OF o,s,a,os,t,m`,[
 p.target_salon_partner_id,"odoo-us-partner-"+p.target_salon_partner_id,activeStates,r.salon_slug
 ],"US_MASTER_TARGET_OWNER_NOT_VERIFIED");
 const q=target.precheck_result_json?.odoo_source_proof;
 if(q?.entry_mode!=="salon"||q.source_request_id!=="odoo-us-partner-"+p.target_salon_partner_id||
   !sameId(q.source_partner_id,p.target_salon_partner_id)||q.profile_write_date!==p.target_salon_write_date||
   q.source_stage_id!==82||q.source_marker!=="totem_us_portal_approved_v1")
   throw fail("US_MASTER_TARGET_SOURCE_REVIEW_REQUIRED");
 return target;
}
async function sessionOwner(db,auth,target){
 if(auth?.source!=="session"||auth.role!=="salon_admin"||!sameId(auth.user_id,target.auth_user_id)||
   typeof auth.session_id!=="string"||!auth.session_id||auth.session_id.length>128)
   throw fail("US_MASTER_DIRECT_OWNER_REQUIRED",403);
 await one(db,`SELECT s.id FROM public.auth_sessions s
   WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '24 hours'
   FOR UPDATE`,[auth.session_id,id(target.auth_user_id)],"US_MASTER_OWNER_SESSION_INVALID");
}
function sameConsent(c,r,target){
 return c?.contract==="g5_existing_salon_consent_v1"&&
  c.fingerprint===fingerprint(r)&&sameId(c.salon_id,target.salon_id)&&
  sameId(c.owner_auth_user_id,target.auth_user_id)&&sameId(c.target_request_id,target.target_request_id);
}
function valid(c,r,target,now){
 return sameConsent(c,r,target)&&c.decision==="granted"&&
  Number.isFinite(Date.parse(c.granted_at))&&Number.isFinite(Date.parse(c.expires_at))&&
  Date.parse(c.granted_at)<=now&&Date.parse(c.expires_at)>now;
}
export function usMasterConsentEnabled(env=process.env){
 return env.TOTEM_US_MASTER_CONSENT_ENABLED==="true"&&env.TOTEM_US_MASTER_CONSENT_RELEASE_APPROVED==="true";
}
// Read and decide under the same locks. Only the direct owner's live session
// may record or withdraw consent. Applicant, admin and indirect member cannot.
export async function decideUsExistingSalonConsent({pool,requestId,auth,decision,expectedFingerprint,env=process.env}={}){
 if(!usMasterConsentEnabled(env))throw fail("US_MASTER_CONSENT_HOLD");
 if(!["grant","revoke","read"].includes(decision))throw fail("US_MASTER_CONSENT_DECISION_INVALID",400);
 const db=await pool.connect();
 try{
  await db.query("BEGIN");
  const r=await lockedRequest(db,requestId);
  if(!["validated","approved"].includes(r.status)||r.created_owner_id||r.created_auth_user_id)
    throw fail("US_MASTER_CONSENT_REQUEST_NOT_PENDING");
  const target=await targetOwner(db,r);
  await sessionOwner(db,auth,target);
  const clock=await one(db,"SELECT clock_timestamp() AS now",[]);
  const now=new Date(clock.now).getTime();
  if(!Number.isFinite(now))throw fail("US_MASTER_CLOCK_INVALID");
  const current=r.precheck_result_json?.master_owner_consent;
  const isValid=valid(current,r,target,now);
  const revision=fingerprint(r);
  if(decision==="grant"&&expectedFingerprint!==revision)throw fail("US_MASTER_CONSENT_REVISION_REQUIRED");
  if(decision==="read"||decision==="grant"&&isValid||
      decision==="revoke"&&sameConsent(current,r,target)&&current.decision==="revoked"){
    await db.query("COMMIT");
    return {request_id:id(r.id),salon_id:id(target.salon_id),consent:isValid?"GRANTED":"REQUIRED",
      expires_at:isValid?current.expires_at:null,idempotent:true,
      ...(decision==="read"?{revision,applicant:{name:r.name,slug:r.slug_final,specialization:r.specialization}}:{})};
  }
  // No arbitrary expiry supplied by caller; one-day window for a pending
  // request, revalidate source and ownership before any future bind.
  const c={contract:"g5_existing_salon_consent_v1",decision:decision==="grant"?"granted":"revoked",
    fingerprint:fingerprint(r),salon_id:id(target.salon_id),owner_auth_user_id:id(target.auth_user_id),
    target_request_id:id(target.target_request_id),granted_at:new Date(now).toISOString(),
    expires_at:new Date(now+86400000).toISOString()};
  await one(db,`UPDATE public.owner_opening_requests SET
    precheck_result_json=jsonb_set(precheck_result_json,'{master_owner_consent}',$2::jsonb,true),
    updated_at=NOW() WHERE id=$1 RETURNING id`,[id(r.id),JSON.stringify(c)]);
  await one(db,`INSERT INTO public.audit_events(event_type,actor,core_user_id,data)
   VALUES($1,$2,$3,$4::jsonb) RETURNING id`,[
    "owner_opening.master_consent_"+c.decision,"owner:"+target.auth_user_id,id(target.auth_user_id),
    JSON.stringify({request_id:id(r.id),salon_id:c.salon_id,target_request_id:c.target_request_id,
      source_request_id:r.source_request_id,fingerprint:c.fingerprint,expires_at:c.expires_at})]);
  await db.query("COMMIT");
  return {request_id:id(r.id),salon_id:c.salon_id,consent:decision==="grant"?"GRANTED":"REQUIRED",
    expires_at:decision==="grant"?c.expires_at:null,idempotent:false};
 }catch(e){await db.query("ROLLBACK").catch(()=>{});throw e;}
 finally{db.release();}
}
// Caller must hold pending request row lock, and revalidate live approved
// Odoo source before transaction. This proof never creates a membership.
export async function assertUsExistingSalonConsent(db,locked){
 const target=await targetOwner(db,locked);
 const clock=await one(db,"SELECT clock_timestamp() AS now",[]);
 const c=locked.precheck_result_json?.master_owner_consent;
 if(!valid(c,locked,target,new Date(clock.now).getTime()))throw fail("US_ODOO_SALON_OWNER_CONSENT_REQUIRED");
 return Object.freeze({salonId:id(target.salon_id),ownerAuthUserId:id(target.auth_user_id),
  targetRequestId:id(target.target_request_id),fingerprint:c.fingerprint});
}
// Read-only commercial authority contract for a future single-principal
// master role. Never reads a second invoice/order, creates a projection,
// enables a user or grants a session. Both role bindings must already exist.
export async function readUsOwnSalonMasterAuthority(db,masterRequestId,{env=process.env}={}){
 if(env.TOTEM_US_OWN_SALON_SHARED_ENTITLEMENT_ENABLED!=="true")throw fail("US_MASTER_SHARED_ENTITLEMENT_HOLD");
 let policy;try{policy=JSON.parse(env.TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON||"");}catch{throw fail("US_MASTER_SHARED_POLICY_REQUIRED");}
 const accessPolicy=readUsSaasProjectionPolicy(env);
 if(!accessPolicy||!Array.isArray(policy.coveredOwnerTypes)||policy.ownSalonEntitlement!=="single_salon_subscription"||
    !policy.coveredOwnerTypes?.includes("salon")||!policy.coveredOwnerTypes?.includes("master"))
   throw fail("US_MASTER_SHARED_POLICY_REQUIRED");
 const r=await one(db,"SELECT * FROM public.owner_opening_requests WHERE id=$1",[id(masterRequestId)]);
 const p=source(r,"master","own_salon");
 if(p.role_set!=="salon,master"||!id(r.created_owner_id)||!id(r.created_auth_user_id))throw fail("US_MASTER_SHARED_IDENTITY_REQUIRED");
 const salon=await one(db,`SELECT o.* FROM public.owner_opening_requests o
 JOIN public.salons s ON s.id=o.created_owner_id
 JOIN public.auth_users a ON a.id=o.created_auth_user_id
 JOIN public.owner_salon os ON os.salon_id=s.id AND os.owner_id=a.id::text
 JOIN public.masters ma ON ma.id=$1 AND ma.user_id=a.id
 JOIN public.master_salon ms ON ms.master_id=ma.id AND ms.salon_id=s.id
 JOIN public.tenant_market_settings t ON t.salon_id=s.id
 JOIN public.markets m ON m.id=t.market_id
 WHERE o.owner_type='salon' AND o.source_namespace='odoo_online'
   AND o.source_company_id=4 AND o.source_website_id=5 AND o.source_partner_id=$2
   AND o.source_request_id=$3 AND o.created_auth_user_id=$4
   AND a.role='salon_admin' AND a.enabled=true AND a.salon_id=s.id::text AND a.salon_slug=s.slug
   AND s.slug=$5 AND s.enabled=true AND s.status='active' AND os.status='active'
   AND ma.slug=$6 AND ms.status='active'
   AND m.code='US' AND m.country_code='US' AND m.active=true AND COALESCE(t.currency_override,m.default_currency)='USD'
   AND NOT EXISTS(SELECT 1 FROM public.master_salon x WHERE x.master_id=ma.id AND x.salon_id<>s.id AND x.status='active')`,
 [id(r.created_owner_id),id(r.source_partner_id),r.source_request_id,id(r.created_auth_user_id),r.salon_slug,r.slug_final],
 "US_MASTER_SHARED_IDENTITY_REQUIRED");
 const q=source(salon,"salon","own_salon");
 if(q.role_set!==p.role_set||!sameId(q.odoo_lead_id,p.odoo_lead_id)||
   q.profile_write_date!==p.profile_write_date||q.lead_write_date!==p.lead_write_date)
   throw fail("US_MASTER_SHARED_SOURCE_CHANGED");
 const projections=await db.query(`SELECT * FROM public.billing_subscriptions
 WHERE (owner_type='salon' AND owner_id=$1) OR (owner_type='master' AND owner_id=$2)`,
 [id(salon.created_owner_id),id(r.created_owner_id)]);
 if(projections.rows.length!==1||projections.rows[0].owner_type!=="salon")throw fail("US_MASTER_SHARED_SINGLE_PROJECTION_REQUIRED");
 const clock=await one(db,"SELECT clock_timestamp() AS now",[]);
 const access=assessUsSaasProjection(projections.rows[0],{marketUs:true,source:salon,now:clock.now,policy:accessPolicy});
 if(!access.can_write)throw fail(access.reason||"US_MASTER_SHARED_PAID_REQUIRED");
 return Object.freeze({principalAuthUserId:id(r.created_auth_user_id),salonRequestId:id(salon.id),
  salonId:id(salon.created_owner_id),masterId:id(r.created_owner_id),paidUntil:access.paid_until,
  subscriptionOrderId:access.subscription_order_id,roleActivationAuthorized:false});
}
