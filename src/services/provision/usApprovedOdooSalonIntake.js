// G3 candidate: sealed Odoo company4/site5 intake only. No payment, activation, provision or email grant.
import {timingSafeEqual,createHash} from "node:crypto";
import {createUsOdooApprovedSourceClient} from "../billing/usOdooReadOnlyClient.js";
import {registerVerifiedUsOdooSources} from "./usOdooSourceRegistration.js";
import {validG3ApproverId} from "./usOdooG3SealProof.js";

const problem=(code,status=409)=>Object.assign(Error(code),{code,status});
const id=v=>Number.isSafeInteger(v)&&v>0?v:0;
const relation=v=>Array.isArray(v)&&v.length===2?id(v[0]):0;
const str=v=>typeof v==="string"?v.trim():"";
const email=v=>str(v).toLowerCase();
const normSlug=v=>str(v).toLowerCase();
const sourceKey=partner=>"odoo-us-partner-"+partner;
const MARKER="totem_us_portal_approved_v1";
const stamp=v=>{
 if(typeof v!=="string"||!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(v))return NaN;
 const t=Date.parse(v.replace(" ","T")+"Z");
 if(!Number.isFinite(t)||v.startsWith("0000-")||new Date(t).toISOString().slice(0,19).replace("T"," ")!==v)return NaN;
 return t;
};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function single(rows,code){if(!Array.isArray(rows)||rows.length!==1||!rows[0]||typeof rows[0]!=="object")throw problem(code);return rows[0];}
export function isUsOdooIntakeHint(body){
 return Boolean(body&&typeof body==="object"&&(
  String(body.market_code??"").trim().toUpperCase()==="US"||
  Number(Array.isArray(body.company_id)?body.company_id[0]:body.company_id)===4||
  Number(Array.isArray(body.team_id)?body.team_id[0]:body.team_id)===8||
  Object.keys(body).some(k=>k.startsWith("x_totem_us_")||["evidence_version","evidence","kid","signature"].includes(k))));
}
const US_ODOO_INTAKE_CODE_RELEASE_APPROVED=false;
export function usOdooIntakeEnabled(env=process.env){
 return US_ODOO_INTAKE_CODE_RELEASE_APPROVED&&env.TOTEM_US_ODOO_INTAKE_ENABLED==="true"&&
   env.TOTEM_US_ODOO_INTAKE_RELEASE_APPROVED==="true"&&
   env.TOTEM_US_ADMIN_MANUAL_ACTIVATION==="true" &&
   env.TOTEM_US_ODOO_G3_SEAL_RELEASE_APPROVED==="true";
}
// First real source only. Intake authorization is never a provision/activation grant.
export function firstManualG3IntakeScope(env=process.env){
 const raw=env.TOTEM_US_ODOO_G3_FIRST_INTAKE_SCOPE;
 const m=typeof raw==="string"?/^([1-9][0-9]{0,15}):([1-9][0-9]{0,15}):([a-f0-9]{64})$/.exec(raw):null;
 if(!m||!id(Number(m[1]))||!id(Number(m[2]))||
    env.TOTEM_US_ODOO_INTAKE_ENABLED!=="true"||env.TOTEM_US_ODOO_INTAKE_RELEASE_APPROVED!=="true"||
    env.TOTEM_US_ODOO_G3_SEAL_RELEASE_APPROVED!=="true"||
    env.TOTEM_US_ODOO_G3_OWNER_ADMIN_REVIEW_APPROVED!=="true"||
    env.TOTEM_US_ODOO_G3_REVIEWER_UIDS!=="2"||
    env.TOTEM_US_ODOO_G3_MANUAL_EVIDENCE_RELEASE_APPROVED!=="true")return null;
 const token=env.TOTEM_US_ODOO_G3_INTAKE_TOKEN;
 if(typeof token!=="string"||!/^[\x21-\x7e]{32,4096}$/.test(token)||token===str(env.ODOO_BRIDGE_TOKEN))return null;
 return Object.freeze({partnerId:Number(m[1]),leadId:Number(m[2]),sourceHash:m[3]});
}
export function firstManualG3IntakeMatches(body,env=process.env,purpose="intake"){
 if(!["intake","reconcile"].includes(purpose))return false;
 const scope=firstManualG3IntakeScope(env),e=body?.evidence,l=e?.lead,p=e?.partner;
 return Boolean(scope&&body?._model==="crm.lead"&&body.market_code==="US"&&body.evidence_version==="g3_owner_admin_evidence_v2"&&
 body._id===scope.leadId&&e?.purpose===purpose&&e.request_id===null&&
 e.company_id===4&&e.website_id===5&&e.team_id===8&&e.actor_uid===2&&
 l?.id===scope.leadId&&relation(l.x_totem_us_source_partner_id)===scope.partnerId&&
 relation(l.partner_id)===scope.partnerId&&p?.id===scope.partnerId&&
 p.x_totem_us_profile_status==="approved"&&p.x_totem_us_approval_revision==="1"&&
 l.x_totem_us_source_hash===scope.sourceHash&&l.x_totem_us_source_revision==="1");
}

// Existing legacy bridge can use query token. The new US branch cannot.
// No query-token authentication or caller-supplied profile/payment fields.
export function assertUsOdooIntakeHeader(headers,query,env=process.env){
 const configured=str(env.TOTEM_US_ODOO_G3_INTAKE_TOKEN),provided=headers?.["x-odoo-bridge-token"];
 if(!configured||configured===str(env.ODOO_BRIDGE_TOKEN)||typeof provided!=="string"||Object.hasOwn(query??{},"token"))
   throw problem("US_ODOO_INTAKE_HEADER_REQUIRED",401);
 const a=Buffer.from(configured),b=Buffer.from(provided);
 if(a.length!==b.length||!timingSafeEqual(a,b))throw problem("US_ODOO_INTAKE_HEADER_REQUIRED",401);
}
function hintId(body){
 if(!body||body._model!=="crm.lead"||body.market_code!=="US"||
   Object.keys(body).some(k=>!["_model","_id","market_code"].includes(k))||!id(body._id))
   throw problem("US_ODOO_INTAKE_HINT_INVALID",400);
 return body._id;
}
export function checkLead(row,leadId,partner){
 if(row.id!==leadId||row.active!==true||row.type!=="lead"||
   relation(row.company_id)!==4||relation(row.team_id)!==8||relation(row.stage_id)!==82||
   relation(row.partner_id)!==partner||relation(row.x_totem_us_source_partner_id)!==partner||
   row.x_totem_us_website_id!==5||row.x_totem_us_source_key!==sourceKey(partner)||
   row.x_totem_us_source_marker!==MARKER||!Number.isFinite(stamp(row.write_date)))
   throw problem("US_ODOO_APPROVED_SOURCE_SCOPE_REQUIRED");
}
export function checkPartner(p,partner,lead){
 if(p.id!==partner||p.active!==true||relation(p.company_id)!==4||relation(p.website_id)!==5||
   p.x_totem_us_profile_status!=="approved"||p.x_totem_us_account_kind!==lead.x_totem_us_owner_type||
   !Number.isFinite(stamp(p.write_date)))
   throw problem("US_ODOO_APPROVED_PROFILE_REQUIRED");
 if(!["salon","master"].includes(p.x_totem_us_account_kind))throw problem("US_ODOO_SOURCE_ROLE_INVALID");
}
// G3: exact sealed typed source; hash is integrity, never authority.
const fail=(reason)=>{throw problem("US_ODOO_G3_"+reason);};
const opt=v=>v===false||v===null?null:v;
const rel=v=>v===false||v===null?null:relation(v)||fail("RELATION_INVALID");
const text=(v,required=false)=>{
 const x=opt(v);
 if(x===null&&!required)return null;
 if(typeof x!=="string"||!x||x!==x.trim()||x!==x.normalize("NFC")||/[\u0000\r\uD800-\uDFFF]/u.test(x))fail("TEXT_INVALID");
 return x;
};
const slugOK=x=>typeof x==="string"&&/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(x)&&!x.includes("--");
const phoneOK=x=>typeof x==="string"&&/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(x);
const approvedAt=v=>{
 const t=stamp(v);
 if(!Number.isFinite(t))fail("APPROVAL_TIME");
 const iso=new Date(t).toISOString();
 if(iso.slice(0,19).replace("T"," ")!==v)fail("APPROVAL_TIME");
 return iso.slice(0,19)+"Z";
};
export function canonicalG3Projection(p,{reviewerIds,now=Date.now(),env=process.env}={}){
 if(!p||!id(p.id)||p.active!==true||relation(p.company_id)!==4||relation(p.website_id)!==5||
 p.x_totem_us_profile_status!=="approved"||p.x_totem_us_approval_revision!=="1")fail("SOURCE_SCOPE");
 const reviewer=relation(p.x_totem_us_approved_by_id);
 if(!validG3ApproverId(reviewer,env)||!Array.isArray(reviewerIds)||!reviewerIds.includes(reviewer))fail("REVIEWER");
 const at=approvedAt(p.x_totem_us_approved_at);
 if(!Number.isFinite(now)||Date.parse(at)>now||!Number.isFinite(stamp(p.write_date))||Date.parse(at)>stamp(p.write_date))fail("APPROVAL_TIME");
 const kind=p.x_totem_us_account_kind,mode=kind==="salon"?"salon":p.x_totem_us_master_entry_mode;
 if(!["salon","master"].includes(kind)||(kind==="salon"&&opt(p.x_totem_us_master_entry_mode)!==null)||
 (kind==="master"&&!["existing_salon","own_salon"].includes(mode)))fail("ROLE");
 const d={schema:"g3_source_v1",namespace:"odoo_online",installation:"totem-platform",
 company_id:4,website_id:5,partner_id:p.id,revision:"1",approved_at:at,approved_by_id:reviewer,kind,mode,
 name:text(p.name,true),email:text(p.email,true),identity_phone:text(p.phone,true),
 master_slug:text(p.x_totem_us_master_slug),master_specialty:text(p.x_totem_us_master_specialty),master_bio:text(p.x_totem_us_master_bio),
 target_salon_partner_id:rel(p.x_totem_us_master_salon_id),target_salon_slug:text(p.x_totem_us_approved_salon_slug),
 business_name:text(p.x_totem_us_business_name),business_phone:text(p.x_totem_us_business_phone),
 business_street:text(p.x_totem_us_business_street),business_city:text(p.x_totem_us_business_city),
 business_state_id:rel(p.x_totem_us_business_state_id),business_state_code:text(p.x_totem_us_approved_state_code),
 business_zip:text(p.x_totem_us_business_zip),business_country:mode==="existing_salon"?null:"US",
 business_slug:text(p.x_totem_us_business_slug),business_description:text(p.x_totem_us_business_description),
 business_website:text(p.x_totem_us_business_website)};
 if(!phoneOK(d.identity_phone)||d.email!==d.email.toLowerCase()||!/^[^@\s]+@[^@\s]+$/.test(d.email)||d.email.length>254)fail("IDENTITY");
 if(kind==="salon"){
  if(["master_slug","master_specialty","master_bio","target_salon_partner_id","target_salon_slug"].some(k=>d[k]!==null))fail("STALE_MASTER");
 }else if(!slugOK(d.master_slug)||!d.master_specialty||d.master_specialty.length>120)fail("MASTER");
 if(mode==="existing_salon"){
  if(Object.keys(d).filter(k=>k.startsWith("business_")).some(k=>d[k]!==null)||!id(d.target_salon_partner_id)||d.target_salon_partner_id===p.id||!slugOK(d.target_salon_slug)||d.target_salon_slug===d.master_slug)fail("TARGET");
 }else{
  if(d.target_salon_partner_id!==null||d.target_salon_slug!==null||!d.business_name||!d.business_street||!d.business_city||
    !id(d.business_state_id)||!/^[A-Z]{2}$/.test(d.business_state_code??"")||!/^\d{5}(?:-\d{4})?$/.test(d.business_zip??"")||
    !slugOK(d.business_slug)||d.business_slug===d.master_slug||!phoneOK(d.business_phone)||
    d.business_phone!==d.identity_phone)fail("BUSINESS");
 }
 return Object.freeze(d);
}
export function hashG3Projection(d){
 return createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.keys(d).sort().map(k=>[k,d[k]]))),"utf8").digest("hex");
}
export function checkProjectionLead(l,d,country,h){
 const expected={contact_name:d.name,email_from:d.email,phone:d.identity_phone,partner_name:d.business_name,
 street:d.business_street,street2:null,city:d.business_city,zip:d.business_zip,website:d.business_website,
 x_totem_us_slug_requested:d.kind==="salon"?d.business_slug:d.master_slug,
 x_totem_us_salon_slug:d.target_salon_slug??d.business_slug,x_totem_us_specialization:d.master_specialty,
 x_totem_us_state_code:d.business_state_code,x_totem_us_postal_code:d.business_zip,
 x_totem_us_master_entry_mode:d.kind==="master"?d.mode:null,x_totem_us_business_phone:d.business_phone,
 x_totem_us_source_revision:d.revision,x_totem_us_source_hash:h};
 for(const [k,v] of Object.entries(expected))if(opt(l[k])!==v)fail("LEAD_MISMATCH");
 if(rel(l.state_id)!==d.business_state_id||rel(l.country_id)!==country||
 rel(l.x_totem_us_existing_salon_partner_id)!==d.target_salon_partner_id||l.x_totem_us_owner_type!==d.kind)fail("LEAD_MISMATCH");
}
const witness=(w,lid)=>{if(!Array.isArray(w)||w.length!==2||w[0]!=="crm.lead"||w[1]!==lid)fail("WITNESS");};
export async function readUsApprovedOdooSource(leadId,{client,now=()=>Date.now(),reviewerIds,readerUid,readVerifiedTargetGeo,env=process.env}={}){
 if(!id(leadId)||!client)throw problem("US_ODOO_SOURCE_ID_INVALID",400);
 try{
  await client.assertReader(readerUid);
  const started=now();
  const lead=single(await client.readLead(leadId),"US_ODOO_APPROVED_SOURCE_NOT_FOUND");
  const partner=relation(lead.x_totem_us_source_partner_id);
  if(!partner)fail("SOURCE_SCOPE");
  checkLead(lead,leadId,partner);
  const p=single(await client.readPartner(partner),"US_ODOO_APPROVED_PROFILE_NOT_FOUND");
  checkPartner(p,partner,lead);
  const d=canonicalG3Projection(p,{reviewerIds,now:started,env}),h=hashG3Projection(d);
  let state=null,target=null,country=null,geo=null,targetSeal=null;
  if(d.mode==="existing_salon"){
   target=single(await client.readPartner(d.target_salon_partner_id),"US_ODOO_TARGET_SALON_REQUIRED");
   if(target.id!==d.target_salon_partner_id||target.active!==true||relation(target.company_id)!==4||relation(target.website_id)!==5||
      target.x_totem_us_profile_status!=="approved"||target.x_totem_us_account_kind!=="salon"||
      target.x_totem_us_business_slug!==d.target_salon_slug||!Number.isFinite(stamp(target.write_date)))fail("TARGET");
   const td=canonicalG3Projection(target,{reviewerIds,now:started,env});
   targetSeal={revision:td.revision,hash:hashG3Projection(td)};
   // Do not guess personal geography from Odoo. Trusted Core lookup is mandatory.
   if(typeof readVerifiedTargetGeo!=="function")fail("TARGET_GEO_HOLD");
   geo=await readVerifiedTargetGeo(d.target_salon_slug);
   if(geo?.slug!==d.target_salon_slug||geo.market_code!=="US"||geo.verified!==true||!text(geo.city,true))fail("TARGET_GEO_HOLD");
  }else{
   state=single(await client.readState(d.business_state_id),"US_ODOO_PROFILE_STATE_REQUIRED");
   if(state.id!==d.business_state_id||relation(state.country_id)!==233||state.code!==d.business_state_code)fail("STATE");
   country=233;
  }
  checkProjectionLead(lead,d,country,h);
  witness(await client.readWitness(partner),leadId);
  const l2=single(await client.readPartnerLeads(partner),"US_ODOO_APPROVED_SOURCE_AMBIGUOUS");
  const p2=single(await client.readPartner(partner),"US_ODOO_APPROVED_PROFILE_NOT_FOUND");
  if(!same(lead,l2)||!same(p,p2)||target&&!same(target,single(await client.readPartner(target.id),"US_ODOO_TARGET_SALON_REQUIRED"))||
   state&&!same(state,single(await client.readState(state.id),"US_ODOO_PROFILE_STATE_REQUIRED")))fail("SOURCE_CHANGED");
  witness(await client.readWitness(partner),leadId);
  const finished=now();
  if(!Number.isFinite(started)||!Number.isFinite(finished)||finished<started||finished-started>15000)fail("SOURCE_CHANGED");
  return buildVerifiedG3Roles({leadId,partner,lead,p,d,h,target,targetSeal,geo});
 }catch(e){
  if(e?.status&&typeof e.code==="string"&&e.code.startsWith("US_ODOO_"))throw e;
  throw problem("US_ODOO_APPROVED_SOURCE_READBACK_UNAVAILABLE",503);
 }
}
// Pure role construction shared by independent readback and attested V2.
export function buildVerifiedG3Roles({leadId,partner,lead,p,d,h,target,targetSeal,geo}){
  const base={market_code:"US",email:d.email,phone:d.identity_phone,admin_notes:"Verified sealed Odoo US approved profile"};
  const roles=[];
  if(d.mode!=="existing_salon")roles.push({...base,owner_type:"salon",name:d.business_name,city:d.business_city,address:d.business_street,
    state_code:d.business_state_code,postal_code:d.business_zip,slug_requested:d.business_slug,description:d.business_description??""});
  if(d.kind==="master")roles.push({...base,owner_type:"master",name:d.name,city:geo?.city??d.business_city,address:d.business_street??"",
    slug_requested:d.master_slug,description:d.master_bio??"",specialization:d.master_specialty,work_mode:"attached_to_salon",
    salon_slug:d.target_salon_slug??d.business_slug});
  return Object.freeze(roles.map(intake=>Object.freeze({
   proof:Object.freeze({source_namespace:"odoo_online",company_id:4,website_id:5,partner_id:partner,source_request_id:sourceKey(partner),owner_type:intake.owner_type}),
   intake:Object.freeze(intake),provenance:Object.freeze({source:"odoo_us_approved_profile_v1",odoo_lead_id:leadId,source_partner_id:partner,
    source_request_id:sourceKey(partner),profile_write_date:p.write_date,lead_write_date:lead.write_date,source_stage_id:82,source_marker:MARKER,
    entry_mode:d.mode,role_set:roles.map(r=>r.owner_type).join(","),target_salon_partner_id:d.target_salon_partner_id,
    target_salon_slug:intake.salon_slug??null,target_salon_write_date:target?.write_date??null,
    source_schema:d.schema,source_revision:d.revision,source_hash:h,source_approved_at:d.approved_at,source_approved_by_id:d.approved_by_id,
    source_external_id:"totem_us_bridge.company4_site5_partner_"+partner,
    target_source_revision:targetSeal?.revision??null,target_source_hash:targetSeal?.hash??null,
    consent_status:d.mode==="existing_salon"?"REQUIRED":null})})));
}
// Compatibility for the existing salon-only readback tests/callers.
export async function readUsApprovedOdooSalonSource(leadId,options){
 const roles=await readUsApprovedOdooSource(leadId,options);
 if(roles.length!==1||roles[0].proof.owner_type!=="salon")throw problem("US_ODOO_MASTER_ROLE_CONTRACT_HOLD");
 return roles[0];
}
export function readG3SourceReaderPolicy(env=process.env){
 const readerUid=Number(env.TOTEM_US_ODOO_G3_READER_UID);
 const reviewerIds=String(env.TOTEM_US_ODOO_G3_REVIEWER_UIDS??"").split(",").map(Number);
 if(!id(readerUid)||readerUid<=2||!reviewerIds.length||reviewerIds.some(x=>!id(x)||x<=2||x===readerUid))fail("READER_POLICY");
 return {readerUid,reviewerIds,env};
}
export function createG3TargetGeoReader(db){
 return async slug=>{
  const {readUsSalon,isUsSalonActive,assertUsSalonLocationReady}=await import("./usOpenOwnerGuards.js");
  const salon=await readUsSalon(db,slug);
  if(!isUsSalonActive(salon)||salon.slug!==slug)fail("TARGET_GEO_HOLD");
  const locationId=await assertUsSalonLocationReady(db,salon.id);
  const rows=(await db.query("SELECT city_name FROM public.us_salon_locations WHERE id=$1 AND salon_id=$2 AND is_primary=true AND enabled=true",[locationId,salon.id])).rows;
  if(rows.length!==1||!rows[0].city_name)fail("TARGET_GEO_HOLD");
  return {slug,market_code:"US",verified:true,city:rows[0].city_name};
 };
}
export async function registerApprovedUsOdooSalon({pool,body,raw,headers,query,
 env=process.env,createClient=createUsOdooApprovedSourceClient,createExistingOpeningRequest,readVerifiedTargetGeo}={}){
 const manual=["evidence_version","evidence","kid","signature"].some(k=>Object.hasOwn(body??{},k));
 // General release stays HOLD; scoped intake never enables the ID-only reader.
 if(manual?!firstManualG3IntakeMatches(body,env):!usOdooIntakeEnabled(env))throw problem("ADMIN_US_ODOO_INTAKE_HOLD");
 assertUsOdooIntakeHeader(headers,query,env);
 if(typeof createExistingOpeningRequest!=="function")throw problem("US_ODOO_INTAKE_CALLBACK_REQUIRED",500);
 const targetGeo=readVerifiedTargetGeo??createG3TargetGeoReader(pool);
 let verified,leadId,readerUid,reviewerIds;
 if(manual){
  // Verification is before any database transaction; canonical raw bytes are mandatory.
  const {verifyManualG3Evidence}=await import("./usG3ManualEvidenceVerifier.js");
  verified=await verifyManualG3Evidence(raw,{purpose:"intake",headers,query,env,readVerifiedTargetGeo:targetGeo});
  leadId=verified[0].provenance.odoo_lead_id;
  if(leadId!==body._id)fail("MANUAL_BODY_MISMATCH");
 }else{
  leadId=hintId(body);
  let url;try{url=new URL(env.TOTEM_US_ODOO_URL);}catch{throw problem("US_ODOO_SOURCE_CONFIG_REQUIRED",503);}
  if(url.origin!=="https://totem-platform.odoo.com"||url.pathname!=="/"||url.search||url.hash||url.username||url.password||
     env.TOTEM_US_ODOO_DB!=="totem-platform"||!str(env.TOTEM_US_ODOO_USER)||!str(env.TOTEM_US_ODOO_API_KEY))
    throw problem("US_ODOO_SOURCE_CONFIG_REQUIRED",503);
  ({readerUid,reviewerIds}=readG3SourceReaderPolicy(env));
 }
 const assertFresh=()=>{
  if(manual&&(!firstManualG3IntakeMatches(body,env)||!verified?.length||verified.some(v=>Date.now()-v.provenance.observed_end_ms>15000)))
   fail("MANUAL_FRESHNESS");
 };
 const results=await registerVerifiedUsOdooSources({pool,candidate:leadId,
   readVerifiedOdooSources:async candidate=>{
    if(!manual)verified=await readUsApprovedOdooSource(candidate,{client:createClient({
      baseUrl:env.TOTEM_US_ODOO_URL,database:env.TOTEM_US_ODOO_DB,
      username:env.TOTEM_US_ODOO_USER,apiKey:env.TOTEM_US_ODOO_API_KEY}),reviewerIds,readerUid,readVerifiedTargetGeo:targetGeo,env});
    assertFresh();return verified.map(v=>v.proof);
   },
   assertExisting:async (existing,proof)=>{
    const v=verified.find(v=>v.proof.owner_type===proof.owner_type);
    assertFresh();
    assertSameG3CommittedSource(existing,v);
   },
   createExistingOpeningRequest:async(db,proof)=>{
    assertFresh();
    const result=await createExistingOpeningRequest(db,verified.find(v=>v.proof.owner_type===proof.owner_type),proof);
    assertFresh();return result;
   },
   beforeCommit:assertFresh,
 });
 if(results.length===1)return results[0];
 return Object.freeze({request_id:results[0].request_id,status:results[0].status,
   duplicate:results.every(r=>r.duplicate),owner_type:"salon",requests:results});
}

// G3-06: signed reconciliation can only observe an already committed first intake.
// This purpose is distinct from intake and has no creation callback or fallback.
function assertSameG3CommittedSource(existing,v){
 const saved=existing?.precheck_result_json?.odoo_source_proof;
 if(!saved||!v?.provenance||
    (saved.authority_mode??null)!==(v.provenance.authority_mode??null)||(saved.authority_kid??null)!==(v.provenance.authority_kid??null)||saved.odoo_lead_id!==v.provenance.odoo_lead_id||saved.source_request_id!==v.proof.source_request_id||
    (saved.entry_mode??"salon")!==v.provenance.entry_mode||(saved.role_set??"salon")!==v.provenance.role_set||
    (saved.target_salon_partner_id??null)!==v.provenance.target_salon_partner_id||
    (saved.target_salon_slug??null)!==v.provenance.target_salon_slug||
    ["source_schema","source_revision","source_hash","source_approved_at","source_approved_by_id","source_external_id","target_source_revision","target_source_hash"].some(k=>saved[k]!==v.provenance[k]))
  throw problem("US_ODOO_EXISTING_SOURCE_REVIEW_REQUIRED");
}
export async function readCommittedManualG3Intake({pool,body,raw,headers,query,env=process.env}={}){
 if(!firstManualG3IntakeMatches(body,env,"reconcile"))throw problem("ADMIN_US_ODOO_INTAKE_HOLD");
 assertUsOdooIntakeHeader(headers,query,env);
 const scope=firstManualG3IntakeScope(env);
 const db=await pool.connect();
 let discard=false;
 const unresolved=()=>{throw problem("US_ODOO_G3_RECOVERY_NOT_CONFIRMED");};
 try{
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await db.query("SET LOCAL statement_timeout='3s'");
  await db.query("SET LOCAL lock_timeout='1s'");
  await db.query("SET LOCAL idle_in_transaction_session_timeout='6s'");
  const {verifyManualG3Evidence}=await import("./usG3ManualEvidenceVerifier.js");
  const verified=await verifyManualG3Evidence(raw,{purpose:"reconcile",headers,query,env,readVerifiedTargetGeo:createG3TargetGeoReader(db)});
  if(!verified.length||verified.some(v=>v.provenance.odoo_lead_id!==scope.leadId||v.provenance.source_hash!==scope.sourceHash||v.proof.partner_id!==scope.partnerId))unresolved();
  const rows=(await db.query(
   "SELECT id,owner_type,status,source_partner_id,source_request_id,moderation_case_id,created_owner_id,created_auth_user_id,precheck_result_json FROM public.owner_opening_requests WHERE source_namespace='odoo_online' AND source_company_id=4 AND source_website_id=5 AND (source_request_id=$1 OR source_partner_id=$2) LIMIT 3",
   [sourceKey(scope.partnerId),scope.partnerId])).rows;
  if(rows.length!==verified.length)unresolved();
  const requests=verified.map(v=>{
   const candidates=rows.filter(r=>r.owner_type===v.proof.owner_type);
   if(candidates.length!==1)unresolved();
   const r=candidates[0],saved=r.precheck_result_json?.odoo_source_proof;
   if(!id(Number(r.id))||!id(Number(r.moderation_case_id))||Number(r.source_partner_id)!==scope.partnerId||
      r.source_request_id!==sourceKey(scope.partnerId)||r.status!=="validated"||r.created_owner_id!==null||r.created_auth_user_id!==null||
      r.precheck_result_json?.normalized?.market_code!=="US"||saved?.purpose!=="intake"||saved.request_id!==null||
      saved.source_partner_id!==scope.partnerId||saved.source_stage_id!==82||saved.source_marker!==MARKER||
      !/^[a-f0-9]{64}$/.test(saved.evidence_digest??""))unresolved();
   assertSameG3CommittedSource(r,v);
   return {request_id:Number(r.id),owner_type:r.owner_type,status:r.status,duplicate:true};
  });
  if(new Set(requests.map(r=>r.request_id)).size!==requests.length||
     !firstManualG3IntakeMatches(body,env,"reconcile")||
     verified.some(v=>Date.now()-v.provenance.observed_end_ms>15000))unresolved();
  await db.query("COMMIT");
  return {outcome:"COMMITTED_READBACK",lead_id:scope.leadId,source_partner_id:scope.partnerId,source_hash:scope.sourceHash,requests,retryAllowed:false};
 }catch(e){
  try{await db.query("ROLLBACK");}catch{discard=true;}
  throw e;
 }finally{db.release(discard);}
}
