import {assertUsOdooDispatchHold,assertManualG3RequestReceipt,isScopedUsOdooRequest,isManualG3Request} from "./usG3ManualRequestReceipt.js";
import {assertUsImportedMasterProvision} from "./usImportedMasterProvision.js";
const err=code=>Object.assign(Error(code),{code,status:409});
// Canonical numeric IDs and PostgreSQL bigint strings only; no coercion.
const id=x=>{
  if(typeof x!=="number"&&(typeof x!=="string"||!/^[1-9][0-9]*$/.test(x)))return 0;
  const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:0;
};
const same=(a,b)=>{const n=id(a);return n>0&&n===id(b);};
const txt=v=>String(v??"").trim();
const mode=r=>r?.precheck_result_json?.odoo_source_proof?.entry_mode;
// Any explicit USA origin remains protected even if its market metadata was damaged.
// Other source namespaces and ordinary KG records are outside this scope.
const scope=`source_namespace='odoo_online' AND (source_company_id=4 OR source_website_id=5 OR
 upper(trim(COALESCE(precheck_result_json->'normalized'->>'market_code',precheck_result_json->>'market_code','')))='US')`;
export async function findScopedCanonicalSources(db,{role,slug,email=null,phone=null,requestId=null,entityId=null}){
 if(!["salon","master"].includes(role))throw err("US_ODOO_CANONICAL_ROLE_INVALID");
 const q=await db.query(`SELECT * FROM public.owner_opening_requests WHERE ${scope} AND owner_type=$1
 AND (lower(slug_final)=lower($2) OR ($3::text IS NOT NULL AND lower(email)=lower($3))
 OR ($4::text IS NOT NULL AND phone_normalized=$4)
 OR ($5::bigint IS NOT NULL AND id=$5) OR ($6::bigint IS NOT NULL AND created_owner_id=$6))
 ORDER BY id FOR UPDATE`,[role,slug,email,phone,requestId,entityId]);
 return q.rows;
}
export async function assertCanonicalUsSalonCreate(db,input,{receipt=null,admin=null,externalTransaction=false,env=process.env}={}){
 const rows=await findScopedCanonicalSources(db,{role:"salon",slug:input.salon_slug,email:input.email,phone:input.phone,requestId:receipt?.requestId??null});
 if(!rows.length){if(receipt)throw err("US_ODOO_CANONICAL_SOURCE_MISSING");return false;}
 for(const r of rows)assertUsOdooDispatchHold(r,env);
 if(rows.length!==1||!externalTransaction||!receipt||input.market_code!=="US")throw err("US_ODOO_SALON_SOURCE_REQUIRED");
 const r=rows[0];
 if(!assertManualG3RequestReceipt(r,receipt,{purpose:"provision",admin,env,canonicalProvision:true})||
    !["salon","own_salon"].includes(mode(r))||r.owner_type!=="salon"||
    r.slug_final!==input.salon_slug||r.email!==input.email||r.name!==input.salon_name||
    r.phone_normalized!==input.phone||txt(r.city)!==txt(input.city)||txt(r.description)!==txt(input.description))
  throw err("US_ODOO_CANONICAL_SALON_INPUT_CHANGED");
 const conflicts=await db.query("SELECT id FROM public.auth_users WHERE lower(email)=lower($1) OR phone=$2 FOR UPDATE",[input.email,input.phone]);
 if(conflicts.rows.length)throw err("US_ODOO_CANONICAL_SALON_IDENTITY_CONFLICT");
 const salons=await db.query("SELECT id FROM public.salons WHERE lower(slug)=lower($1) OR phone=$2 FOR UPDATE",[input.salon_slug,input.phone]);
 if(salons.rows.length)throw err("US_ODOO_CANONICAL_SALON_ENTITY_CONFLICT");
 return true;
}
export async function assertCanonicalUsProvisionResult(db,r,{ownerId,authUserId,masterReceipt=null,manualReceipt=null,admin=null,env=process.env}={}){
 if(!isScopedUsOdooRequest(r))return;
 assertUsOdooDispatchHold(r,env);
 if(r.status!=="provisioning"||!same(ownerId,ownerId)||!same(authUserId,authUserId))
  throw err("US_ODOO_CANONICAL_RESULT_INVALID");
 if(r.owner_type==="salon"){
  if(!assertManualG3RequestReceipt(r,manualReceipt,{purpose:"provision",admin,env,canonicalProvision:true}))
   throw err("US_ODOO_SALON_SOURCE_REQUIRED");
  const q=await db.query(`SELECT s.id FROM public.salons s
   JOIN public.auth_users a ON a.id=$2
   JOIN public.owner_salon os ON os.salon_id=s.id AND os.owner_id=a.id::text
   JOIN public.tenant_market_settings t ON t.salon_id=s.id
   JOIN public.markets m ON m.id=t.market_id
   WHERE s.id=$1 AND s.slug=$3 AND s.status='draft' AND a.role='salon_admin' AND a.enabled=false
   AND a.salon_id=s.id::text AND a.salon_slug=s.slug AND a.master_id IS NULL AND a.master_slug IS NULL
   AND lower(a.email)=lower($4) AND a.phone=$5 AND os.status='active'
   AND m.code='US' AND m.country_code='US' AND m.active=true AND COALESCE(t.currency_override,m.default_currency)='USD'
   AND (SELECT count(*) FROM public.owner_salon x WHERE x.salon_id=s.id)=1
   FOR UPDATE OF s,a,os,t,m`,[ownerId,authUserId,r.slug_final,r.email,r.phone_normalized]);
  if(q.rows.length!==1)throw err("US_ODOO_CANONICAL_SALON_RESULT_MISMATCH");
  return;
 }
 if(r.owner_type!=="master")throw err("US_ODOO_CANONICAL_ROLE_INVALID");
 if(isManualG3Request(r)&&!assertManualG3RequestReceipt(r,manualReceipt,{purpose:"provision",admin,env,canonicalProvision:true}))
  throw err("US_ODOO_CANONICAL_MASTER_SOURCE_REQUIRED");
 const a=await assertUsImportedMasterProvision(db,r,masterReceipt,{env});
 const q=await db.query(`SELECT ma.id,u.role,u.enabled,u.master_id,u.master_slug,u.salon_id,u.salon_slug
  FROM public.masters ma JOIN public.auth_users u ON u.id=ma.user_id
  JOIN public.master_salon ms ON ms.master_id=ma.id
  JOIN public.salons s ON s.id=ms.salon_id
  JOIN public.tenant_market_settings t ON t.salon_id=s.id
  JOIN public.markets m ON m.id=t.market_id
  WHERE ma.id=$1 AND u.id=$2 AND ma.slug=$3 AND ma.active=false AND s.id=$4 AND s.slug=$5
  AND ms.status='active' AND s.enabled=true AND s.status='active'
  AND lower(u.email)=lower($6) AND u.phone=$7
  AND m.code='US' AND m.country_code='US' AND m.active=true AND COALESCE(t.currency_override,m.default_currency)='USD'
  AND (SELECT count(*) FROM public.master_salon x WHERE x.master_id=ma.id)=1
  FOR UPDATE OF ma,u,ms,s,t,m`,[ownerId,authUserId,r.slug_final,a.salonId,r.salon_slug,r.email,r.phone_normalized]);
 if(q.rows.length!==1)throw err("US_ODOO_CANONICAL_MASTER_RESULT_MISMATCH");
 const u=q.rows[0];
 if(a.mode==="own_salon"){
  if(!same(authUserId,a.principalId)||u.role!=="salon_admin"||u.enabled!==true||
     u.master_id!==null||u.master_slug!==null||!same(u.salon_id,a.salonId)||u.salon_slug!==r.salon_slug)
    throw err("US_ODOO_CANONICAL_SHARED_PRINCIPAL_MISMATCH");
 }else if(a.mode==="existing_salon"){
  if(u.role!=="master"||u.enabled!==false||!same(u.master_id,ownerId)||u.master_slug!==r.slug_final)
    throw err("US_ODOO_CANONICAL_MASTER_IDENTITY_MISMATCH");
 }else throw err("US_ODOO_CANONICAL_ROLE_INVALID");
}
