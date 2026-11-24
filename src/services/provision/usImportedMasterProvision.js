// One verified source receipt per request; only internal callers can obtain it.
// No external RPC in a PostgreSQL transaction. All mutable Core checks are
// repeated under row locks immediately before the canonical bind.
import {createUsOdooApprovedSourceClient} from "../billing/usOdooReadOnlyClient.js";
import {readUsApprovedOdooSource,readG3SourceReaderPolicy,createG3TargetGeoReader,usOdooIntakeEnabled} from "./usApprovedOdooSalonIntake.js";
import {isManualG3Request,assertManualG3RequestReceipt,assertUsOdooDispatchHold,isScopedUsOdooRequest} from "./usG3ManualRequestReceipt.js";
import {sameG3Seal,validG3Seal} from "./usOdooG3SealProof.js";
import {assertUsExistingSalonConsent} from "./usMasterRoleAuthority.js";
import {US_COUNTRY_PACK} from "../../market-context/country-packs/US.js";
const receipts=new WeakSet();
const fail=(code,status=409)=>Object.assign(Error(code),{code,status});
const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):0;
const equal=(a,b)=>id(a)>0&&id(a)===id(b);
const proof=r=>r?.precheck_result_json?.odoo_source_proof;
export const isImportedMaster=r=>r?.owner_type==="master"&&isScopedUsOdooRequest(r);
export const usImportedMasterProvisionEnabled=(env=process.env)=>usOdooIntakeEnabled(env)&&env.TOTEM_US_IMPORTED_MASTER_PROVISION_ENABLED==="true"&&env.TOTEM_US_IMPORTED_MASTER_PROVISION_RELEASE_APPROVED==="true";
const hold=r=>fail(proof(r)?.entry_mode==="existing_salon"?"US_ODOO_SALON_OWNER_CONSENT_REQUIRED":
 proof(r)?.entry_mode==="own_salon"?"US_ODOO_SHARED_IDENTITY_COMMERCIAL_CONTRACT_HOLD":"US_ODOO_MASTER_ROLE_CONTRACT_HOLD");
const keys=["source","odoo_lead_id","source_partner_id","source_request_id","source_stage_id","source_marker","entry_mode","role_set","target_salon_partner_id","target_salon_slug"];
function compare(r,v){
 const p=proof(r),a=v?.provenance,i=v?.intake;
 if(!isImportedMaster(r)||!p||!a||!i||Number(r.source_company_id)!==4||Number(r.source_website_id)!==5||
    !equal(r.source_partner_id,v.proof.partner_id)||r.source_request_id!==v.proof.source_request_id||
    v.proof.owner_type!=="master"||!sameG3Seal(p,a)||p.target_source_revision!==a.target_source_revision||p.target_source_hash!==a.target_source_hash||keys.some(k=>(p[k]??null)!==(a[k]??null))||
    r.slug_final!==i.slug_requested||r.salon_slug!==i.salon_slug||r.work_mode!=="attached_to_salon"||
    String(r.email).toLowerCase()!==String(i.email).toLowerCase()||r.name!==i.name||
    String(r.specialization||"")!==String(i.specialization||"")||
    r.phone_normalized!==US_COUNTRY_PACK.normalizeBusinessPhone(i.phone).phone)
   throw fail("US_MASTER_SOURCE_REVISION_CHANGED");
}
export async function prepareUsImportedMasterReceipt(db,requestId,{env=process.env,createClient=createUsOdooApprovedSourceClient,manualReceipt=null,purpose,admin}={}){
 if(!usImportedMasterProvisionEnabled(env))return null;
 const r=(await db.query("SELECT * FROM public.owner_opening_requests WHERE id=$1",[requestId])).rows[0];
 if(manualReceipt){
  assertManualG3RequestReceipt(r,manualReceipt,{purpose,admin,env});
  if(!isImportedMaster(r))return null;
  compare(r,manualReceipt.verified);
  const receipt=Object.freeze({requestId:id(r.id),verified:manualReceipt.verified,at:manualReceipt.at,manual:true});
  receipts.add(receipt);return receipt;
 }
 if(isManualG3Request(r))throw fail("US_MASTER_FRESH_SOURCE_REQUIRED");
 if(!isImportedMaster(r)||!["validated","approved","provisioned"].includes(r.status))return null;
 let url;try{url=new URL(env.TOTEM_US_ODOO_URL);}catch{throw fail("US_MASTER_SOURCE_CONFIG_REQUIRED",503);}
 if(url.origin!=="https://totem-platform.odoo.com"||url.pathname!=="/"||url.search||url.hash||url.username||url.password||
   env.TOTEM_US_ODOO_DB!=="totem-platform"||!env.TOTEM_US_ODOO_USER?.trim()||!env.TOTEM_US_ODOO_API_KEY?.trim())throw fail("US_MASTER_SOURCE_CONFIG_REQUIRED",503);
 if(!validG3Seal(proof(r)))throw fail("US_MASTER_SOURCE_REVISION_CHANGED");
 const roles=await readUsApprovedOdooSource(proof(r)?.odoo_lead_id,{client:createClient({baseUrl:env.TOTEM_US_ODOO_URL,database:env.TOTEM_US_ODOO_DB,username:env.TOTEM_US_ODOO_USER,apiKey:env.TOTEM_US_ODOO_API_KEY}),...readG3SourceReaderPolicy(env),readVerifiedTargetGeo:createG3TargetGeoReader(db)});
 const v=roles.find(x=>x.proof.owner_type==="master");compare(r,v);
 const receipt=Object.freeze({requestId:id(r.id),verified:v,at:Date.now()});receipts.add(receipt);return receipt;
}
export async function assertUsImportedMasterProvision(db,r,receipt,{env=process.env}={}){
 assertUsOdooDispatchHold(r,env);
 if(!usImportedMasterProvisionEnabled(env))throw hold(r);
 if(!receipt||!receipts.has(receipt)||!equal(receipt.requestId,r.id)||Date.now()-receipt.at>15000||Date.now()<receipt.at)
   throw fail("US_MASTER_FRESH_SOURCE_REQUIRED");
 compare(r,receipt.verified);
 if(receipt.manual&&Date.now()-receipt.verified.provenance.observed_end_ms>15000)throw fail("US_MASTER_FRESH_SOURCE_REQUIRED");
 const p=proof(r);
 if(p.entry_mode==="existing_salon"){
   if(env.TOTEM_US_MASTER_CONSENT_ENABLED!=="true"||env.TOTEM_US_MASTER_CONSENT_RELEASE_APPROVED!=="true")throw hold(r);
   const c=await assertUsExistingSalonConsent(db,r);
   return {mode:"existing_salon",salonId:c.salonId};
 }
 if(p.entry_mode!=="own_salon"||p.role_set!=="salon,master")throw hold(r);
 let policy;try{policy=JSON.parse(env.TOTEM_US_ODOO_SAAS_COMMERCIAL_POLICY_JSON||"");}catch{throw hold(r);}
 if(env.TOTEM_US_OWN_SALON_SHARED_ENTITLEMENT_ENABLED!=="true"||policy.approved!==true||
    policy.ownSalonEntitlement!=="single_salon_subscription"||
    !Array.isArray(policy.coveredOwnerTypes)||!["salon","master"].every(t=>policy.coveredOwnerTypes.includes(t)))throw hold(r);
 const rows=await db.query(`SELECT o.*,a.id AS principal_id,a.email AS principal_email,a.phone AS principal_phone,
    a.email_verified_at,a.role AS principal_role,a.enabled AS principal_enabled,a.salon_slug,a.master_slug,a.salon_id
 FROM public.owner_opening_requests o
 JOIN public.auth_users a ON a.id=o.created_auth_user_id
 JOIN public.salons s ON s.id=o.created_owner_id
 JOIN public.owner_salon os ON os.salon_id=s.id AND os.owner_id=a.id::text
 JOIN public.tenant_market_settings t ON t.salon_id=s.id
 JOIN public.markets m ON m.id=t.market_id
 WHERE o.owner_type='salon' AND o.source_namespace='odoo_online' AND o.source_company_id=4
 AND o.source_website_id=5 AND o.source_partner_id=$1 AND o.source_request_id=$2
 AND o.status IN ('activated','email_ready','email_sent','email_failed')
 AND a.role='salon_admin' AND a.enabled=true AND a.email_verified_at IS NOT NULL
 AND a.salon_slug=s.slug AND a.salon_id=s.id::text AND a.master_slug IS NULL
 AND s.slug=$3 AND s.enabled=true AND s.status='active' AND os.status='active'
 AND m.code='US' AND m.country_code='US' AND m.active=true AND COALESCE(t.currency_override,m.default_currency)='USD'
 FOR UPDATE OF o,a,s,os,t,m`,[r.source_partner_id,r.source_request_id,r.salon_slug]);
 if(rows.rows.length!==1)throw fail("US_MASTER_SHARED_IDENTITY_REQUIRED");
 const principal=rows.rows[0],q=proof(principal);
 if(!q||q.entry_mode!=="own_salon"||q.role_set!==p.role_set||
   !equal(q.odoo_lead_id,p.odoo_lead_id)||!sameG3Seal(q,p)||String(principal.principal_email).toLowerCase()!==String(r.email).toLowerCase()||
   principal.principal_phone!==r.phone_normalized)
   throw fail("US_MASTER_SHARED_IDENTITY_REQUIRED");
 return {mode:"own_salon",salonId:id(principal.created_owner_id),principalId:id(principal.principal_id)};
}
export async function assertCanonicalImportedMasterBind(db,{salon,master,receipt,bindMode,createContract,env=process.env}){
 // Existing manual US path unchanged if there is no Odoo master source.
 const found=await db.query(`SELECT * FROM public.owner_opening_requests WHERE owner_type='master'
 AND source_namespace='odoo_online' AND (source_company_id=4 OR source_website_id=5 OR upper(trim(COALESCE(precheck_result_json->'normalized'->>'market_code',precheck_result_json->>'market_code','')))='US') AND (lower(slug_final)=lower($1) OR created_owner_id=$2)
 ORDER BY id FOR UPDATE`,[master.slug,master.id]);
 if(!found.rows.length){if(receipt)throw fail("US_MASTER_SOURCE_MISSING");return;}
 for(const r of found.rows)assertUsOdooDispatchHold(r,env);
 if(salon.market_code!=="US"||bindMode!=="active"||createContract!==false)
   throw fail("US_MASTER_BIND_SCOPE_INVALID");
 if(found.rows.length!==1||found.rows[0].status!=="provisioning")throw fail("US_MASTER_BIND_SOURCE_STATE_INVALID");
 const r=found.rows[0],a=await assertUsImportedMasterProvision(db,r,receipt,{env});
 const prior=await db.query("SELECT id FROM public.master_salon WHERE master_id=$1 FOR UPDATE",[master.id]);
 if(prior.rows.length)throw fail("US_MASTER_BIND_EXISTING_RELATION");
 if(!equal(salon.id,a.salonId)||master.slug!==r.slug_final||master.active!==false)
   throw fail("US_MASTER_BIND_SCOPE_INVALID");
 if(a.mode==="own_salon"){
   if(!equal(master.user_id,a.principalId))throw fail("US_MASTER_SHARED_IDENTITY_REQUIRED");
 }else{
   const u=await db.query("SELECT id FROM public.auth_users WHERE id=$1 AND role='master' AND enabled=false AND master_slug=$2 AND master_id=$3 AND lower(email)=lower($4) AND phone=$5 FOR UPDATE",
    [master.user_id,r.slug_final,String(master.id),r.email,r.phone_normalized]);
   if(u.rows.length!==1)throw fail("US_MASTER_BIND_IDENTITY_INVALID");
 }
}
