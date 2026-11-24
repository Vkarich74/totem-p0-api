// KG only: existing salon owner becoming a master in that exact salon.
// Reuse one principal; never duplicate credentials, copy phone or change DB uniqueness.
const CONTRACT="kg_shared_owner_master_v1";
const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):0;
const fail=code=>Object.assign(Error(code),{code,status:409});
export const kgSharedMasterEnabled=(env=process.env)=>env.TOTEM_KG_SHARED_MASTER_ENABLED==="true"&&env.TOTEM_KG_SHARED_MASTER_RELEASE_APPROVED==="true";
export const kgSharedMasterProof=r=>r?.precheck_result_json?.kg_shared_owner?.contract===CONTRACT?r.precheck_result_json.kg_shared_owner:null;
export function isKgSharedMasterCandidate({marketCode,ownerType,workMode,salonSlug,phone,email}={},env=process.env){
 return kgSharedMasterEnabled(env)&&["","KG"].includes(String(marketCode||""))&&ownerType==="master"&&
  workMode==="attached_to_salon"&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(salonSlug||"")&&
  /^\+996\d{9}$/.test(phone||"")&&typeof email==="string"&&email.includes("@");
}
async function directOwner(db,{email,phone,salonSlug},lock){
 const rows=await db.query(`SELECT a.id AS principal_id,s.id AS salon_id
 FROM public.auth_users a
 JOIN public.salons s ON a.salon_id=s.id::text AND a.salon_slug=s.slug
 JOIN public.owner_salon os ON os.salon_id=s.id AND os.owner_id=a.id::text
 JOIN public.tenant_market_settings t ON t.salon_id=s.id
 JOIN public.markets m ON m.id=t.market_id
 WHERE lower(a.email)=lower($1) AND a.phone=$2 AND a.role='salon_admin'
 AND a.enabled=true AND s.slug=$3 AND s.enabled=true AND s.status='active'
 AND os.status='active' AND m.code='KG' AND m.country_code='KG' AND m.active=true
 AND COALESCE(t.currency_override,m.default_currency)='KGS'
 ${lock?"FOR UPDATE OF a,s,os,t,m":""}`,[email,phone,salonSlug]);
 if(rows.rows.length!==1)return null;
 // Reject every other matching principal, including alternate-case email.
 const conflicts=await db.query("SELECT id FROM public.auth_users WHERE lower(email)=lower($1) OR phone=$2"+(lock?" FOR UPDATE":""),[email,phone]);
 if(conflicts.rows.length!==1||id(conflicts.rows[0].id)!==id(rows.rows[0].principal_id))return null;
 return rows.rows[0];
}
export async function readKgSharedMasterCandidate(db,input,{lock=false,requestId=null,env=process.env}={}){
 if(!isKgSharedMasterCandidate(input,env))return null;
 const a=await directOwner(db,input,lock);
 if(!a)return null;
 const existing=await db.query("SELECT id FROM public.masters WHERE user_id=$1 OR slug=$2"+(lock?" FOR UPDATE":""),[id(a.principal_id),input.masterSlug]);
 if(existing.rows.length)return null;
 const pending=await db.query(`SELECT id FROM public.owner_opening_requests
 WHERE owner_type='master' AND status NOT IN ('rejected','failed','validation_failed')
 AND ($3::bigint IS NULL OR id<>$3) AND
 (precheck_result_json->'kg_shared_owner'->>'principal_auth_user_id'=$1 OR slug_final=$2)
 ${lock?"FOR UPDATE":""}`,[String(a.principal_id),input.masterSlug,requestId]);
 if(pending.rows.length)return null;
 return Object.freeze({contract:CONTRACT,principal_auth_user_id:id(a.principal_id),salon_id:id(a.salon_id),salon_slug:input.salonSlug,master_slug:input.masterSlug});
}
function sameProof(a,b){
 return a&&b&&a.contract===b.contract&&id(a.principal_auth_user_id)===id(b.principal_auth_user_id)&&
  id(a.salon_id)===id(b.salon_id)&&a.salon_slug===b.salon_slug&&a.master_slug===b.master_slug;
}
export async function assertKgSharedMasterPending(db,r,{env=process.env}={}){
 const p=kgSharedMasterProof(r);
 if(!p||!kgSharedMasterEnabled(env)||r?.owner_type!=="master"||r?.work_mode!=="attached_to_salon"||
    r.precheck_result_json?.normalized?.market_code!=="KG"||
    !["validated","approved","provisioning"].includes(r.status)||
    r.created_owner_id||r.created_auth_user_id)throw fail("KG_SHARED_MASTER_REQUEST_INVALID");
 const a=await readKgSharedMasterCandidate(db,{marketCode:"KG",ownerType:"master",workMode:r.work_mode,
  salonSlug:r.salon_slug,masterSlug:r.slug_final,email:r.email,phone:r.phone_normalized},{lock:true,requestId:id(r.id),env});
 if(!sameProof(a,p))throw fail("KG_SHARED_MASTER_IDENTITY_CHANGED");
 return a;
}
const ACTIVE=["activated","email_ready","email_sent","email_failed"];
// All authority is re-read from Core, not from a browser claim.
export async function readKgSharedMasterBindings(db,{principalId=null,masterSlug=null,requestId=null,target=null,allowProvisioned=false,lock=false,env=process.env}={}){
 if(!kgSharedMasterEnabled(env))return [];
 if(!id(principalId)&&!id(requestId)&&!target?.value)return [];
 if(target&&!["email","phone"].includes(target.lookup))return [];
 const states=allowProvisioned?["provisioned",...ACTIVE]:ACTIVE;
 const rows=await db.query(`SELECT r.id AS request_id,r.slug_final AS master_slug,
  r.created_owner_id AS master_id,r.created_auth_user_id AS principal_id,
  a.password_hash,a.salon_slug,a.enabled,a.email,r.email AS request_email,
  a.phone,r.phone_normalized,s.id AS salon_id
 FROM public.owner_opening_requests r
 JOIN public.auth_users a ON a.id=r.created_auth_user_id
 JOIN public.masters ma ON ma.id=r.created_owner_id AND ma.user_id=a.id AND ma.slug=r.slug_final
 JOIN public.master_salon ms ON ms.master_id=ma.id
 JOIN public.salons s ON s.id=ms.salon_id AND s.slug=r.salon_slug AND a.salon_id=s.id::text AND a.salon_slug=s.slug
 JOIN public.owner_salon os ON os.salon_id=s.id AND os.owner_id=a.id::text
 JOIN public.tenant_market_settings t ON t.salon_id=s.id
 JOIN public.markets m ON m.id=t.market_id
 WHERE r.owner_type='master' AND r.work_mode='attached_to_salon' AND r.status=ANY($1::text[])
 AND r.precheck_result_json->'normalized'->>'market_code'='KG'
 AND r.precheck_result_json->'kg_shared_owner'->>'contract'='kg_shared_owner_master_v1'
 AND r.precheck_result_json->'kg_shared_owner'->>'principal_auth_user_id'=a.id::text
 AND r.precheck_result_json->'kg_shared_owner'->>'salon_id'=s.id::text
 AND r.precheck_result_json->'kg_shared_owner'->>'master_slug'=ma.slug
 AND r.precheck_result_json->'kg_shared_owner'->>'salon_slug'=s.slug
 AND a.enabled=true AND a.role='salon_admin' AND lower(a.email)=lower(r.email) AND a.phone=r.phone_normalized
 AND s.enabled=true AND s.status='active' AND os.status='active' AND ms.status='active'
 AND m.code='KG' AND m.country_code='KG' AND m.active=true AND COALESCE(t.currency_override,m.default_currency)='KGS'
 AND ($2::integer IS NULL OR a.id=$2) AND ($3::text IS NULL OR ma.slug=$3)
 AND ($4::bigint IS NULL OR r.id=$4)
 AND ($5::text IS NULL OR ($6='email' AND lower(a.email)=lower($5)) OR ($6='phone' AND a.phone=$5))
 AND (ma.active=true OR ($7::boolean AND r.status='provisioned'))
 AND NOT EXISTS(SELECT 1 FROM public.master_salon other WHERE other.master_id=ma.id AND other.salon_id<>s.id AND other.status='active')
 ${lock?"FOR UPDATE OF r,a,ma,ms,s,os,t,m":""}`,[
 states,id(principalId)||null,masterSlug||null,id(requestId)||null,target?.value||null,target?.lookup||null,allowProvisioned
 ]);
 return rows.rows.map(x=>({...x,id:id(x.principal_id),role:"master",kg_shared_master_request_id:id(x.request_id)}));
}
export async function assertKgSharedMasterActivation(db,r){
 const p=kgSharedMasterProof(r);
 if(!p||r.status!=="provisioned")throw fail("KG_SHARED_MASTER_REQUEST_INVALID");
 const rows=await readKgSharedMasterBindings(db,{requestId:id(r.id),principalId:id(r.created_auth_user_id),allowProvisioned:true,lock:true});
 if(rows.length!==1||id(rows[0].master_id)!==id(r.created_owner_id)||id(rows[0].salon_id)!==id(p.salon_id))
  throw fail("KG_SHARED_MASTER_BINDING_CHANGED");
 return rows[0];
}
export const isKgSharedMasterClaim=p=>p?.kg_shared_master_request_id!==undefined;
export function kgSharedMasterClaim(user){
 return id(user?.kg_shared_master_request_id)?{kg_shared_master_request_id:id(user.kg_shared_master_request_id)}:{};
}
// Exact master namespace only, never enter another salon's or master's routes.
// Additional SDK route coverage is a release prerequisite.
export function isKgSharedMasterRouteAllowed(req,slug){
 const path=String(req.path||""),method=String(req.method||"").toUpperCase();
 if(method==="GET"&&path==="/auth/session/resolve")return true;
 if(method==="POST"&&["/auth/logout","/auth/logout-all","/auth/set-password"].includes(path))return true;
 return (path==="/masters/"+slug||path.startsWith("/masters/"+slug+"/"))&&
   /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)&&!path.includes("%")&&!path.includes("..");
}
