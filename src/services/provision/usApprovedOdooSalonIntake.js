// G5: first real approved source contract, verified from Odoo company4/site5.
// This is not a payment, approval, provision or email grant. Master intake
// remains HOLD until the own_salon/existing_salon role/consent contract is proven.
import {timingSafeEqual} from "node:crypto";
import {createUsOdooApprovedSourceClient} from "../billing/usOdooReadOnlyClient.js";
import {registerVerifiedUsOdooSource} from "./usOdooSourceRegistration.js";

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
 return Date.parse(v.replace(" ","T")+"Z");
};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function single(rows,code){if(!Array.isArray(rows)||rows.length!==1||!rows[0]||typeof rows[0]!=="object")throw problem(code);return rows[0];}
export function isUsOdooIntakeHint(body){
 return Boolean(body&&typeof body==="object"&&(
  String(body.market_code??"").trim().toUpperCase()==="US"||
  Number(Array.isArray(body.company_id)?body.company_id[0]:body.company_id)===4||
  Number(Array.isArray(body.team_id)?body.team_id[0]:body.team_id)===8||
  Object.keys(body).some(k=>k.startsWith("x_totem_us_"))));
}
export function usOdooIntakeEnabled(env=process.env){
 return env.TOTEM_US_ODOO_INTAKE_ENABLED==="true"&&
   env.TOTEM_US_ODOO_INTAKE_RELEASE_APPROVED==="true"&&
   env.TOTEM_US_ADMIN_MANUAL_ACTIVATION==="true";
}
// Existing legacy bridge can use query token. The new US branch cannot.
// No query-token authentication or caller-supplied profile/payment fields.
export function assertUsOdooIntakeHeader(headers,query,env=process.env){
 const configured=str(env.ODOO_BRIDGE_TOKEN),provided=headers?.["x-odoo-bridge-token"];
 if(!configured||typeof provided!=="string"||Object.hasOwn(query??{},"token"))
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
function checkLead(row,leadId,partner){
 if(row.id!==leadId||row.active!==true||row.type!=="lead"||
   relation(row.company_id)!==4||relation(row.team_id)!==8||relation(row.stage_id)!==82||
   relation(row.partner_id)!==partner||relation(row.x_totem_us_source_partner_id)!==partner||
   row.x_totem_us_website_id!==5||row.x_totem_us_source_key!==sourceKey(partner)||
   row.x_totem_us_source_marker!==MARKER||!Number.isFinite(stamp(row.write_date)))
   throw problem("US_ODOO_APPROVED_SOURCE_SCOPE_REQUIRED");
}
function checkPartner(p,partner,lead){
 if(p.id!==partner||p.active!==true||relation(p.company_id)!==4||relation(p.website_id)!==5||
   p.x_totem_us_profile_status!=="approved"||p.x_totem_us_account_kind!==lead.x_totem_us_owner_type||
   !Number.isFinite(stamp(p.write_date))||stamp(p.write_date)>stamp(lead.write_date))
   throw problem("US_ODOO_APPROVED_PROFILE_REQUIRED");
 if(p.x_totem_us_account_kind!=="salon")throw problem("US_ODOO_MASTER_ROLE_CONTRACT_HOLD");
}
export async function readUsApprovedOdooSalonSource(leadId,{client,now=()=>Date.now()}={}){
 if(!id(leadId)||!client)throw problem("US_ODOO_SOURCE_ID_INVALID",400);
 const started=now();
 try{
  const lead=single(await client.readLead(leadId),"US_ODOO_APPROVED_SOURCE_NOT_FOUND");
  const partner=relation(lead.x_totem_us_source_partner_id);
  if(!partner)throw problem("US_ODOO_APPROVED_SOURCE_SCOPE_REQUIRED");
  checkLead(lead,leadId,partner);
  const p=single(await client.readPartner(partner),"US_ODOO_APPROVED_PROFILE_NOT_FOUND");
  checkPartner(p,partner,lead);
  // Compare actual CRM snapshot fields with approved profile; no caller
  // contact details or provider payment assertions are used.
  const stateId=relation(p.x_totem_us_business_state_id);
  if(!stateId)throw problem("US_ODOO_PROFILE_STATE_REQUIRED");
  const state=single(await client.readState(stateId),"US_ODOO_PROFILE_STATE_REQUIRED");
  const name=str(p.x_totem_us_business_name),phone=str(p.x_totem_us_business_phone),
   street=str(p.x_totem_us_business_street),city=str(p.x_totem_us_business_city),
   zip=str(p.x_totem_us_business_zip),slug=normSlug(p.x_totem_us_business_slug),
   addressState=str(state.code).toUpperCase(),contact=email(p.email);
  if(state.id!==stateId||relation(state.country_id)!==233||!name||!phone||!street||!city||
     !/^[A-Z]{2}$/.test(addressState)||!/^\d{5}(?:-\d{4})?$/.test(zip)||
     !/^[a-z0-9][a-z0-9-]{2,79}$/.test(slug)||!contact||
     email(lead.email_from)!==contact||str(lead.phone)!==phone||
     str(lead.street)!==street||str(lead.city)!==city||relation(lead.state_id)!==stateId||
     str(lead.x_totem_us_state_code).toUpperCase()!==addressState||
     str(lead.zip)!==zip||str(lead.x_totem_us_postal_code)!==zip||
     normSlug(lead.x_totem_us_slug_requested)!==slug)
    throw problem("US_ODOO_APPROVED_PROFILE_SNAPSHOT_MISMATCH");
  // Confirm one lead, including inactive records, and re-read the profile.
  // A concurrent revision or duplicated CRM source cannot create a request.
  const latestLead=single(await client.readPartnerLeads(partner),"US_ODOO_APPROVED_SOURCE_AMBIGUOUS");
  const latestPartner=single(await client.readPartner(partner),"US_ODOO_APPROVED_PROFILE_NOT_FOUND");
  if(!same(lead,latestLead)||!same(p,latestPartner)||!Number.isFinite(started)||
     !Number.isFinite(now())||now()<started||now()-started>15000)
    throw problem("US_ODOO_APPROVED_SOURCE_CHANGED");
  return Object.freeze({
   proof:Object.freeze({source_namespace:"odoo_online",company_id:4,website_id:5,
    partner_id:partner,source_request_id:sourceKey(partner),owner_type:"salon"}),
   intake:Object.freeze({owner_type:"salon",market_code:"US",name,email:contact,phone,city,
    address:street,state_code:addressState,postal_code:zip,slug_requested:slug,
    description:str(p.x_totem_us_business_description),admin_notes:"Verified Odoo US approved profile"}),
   provenance:Object.freeze({source:"odoo_us_approved_profile_v1",odoo_lead_id:leadId,
    source_partner_id:partner,source_request_id:sourceKey(partner),profile_write_date:p.write_date,
    lead_write_date:lead.write_date,source_stage_id:82,source_marker:MARKER}),
  });
 }catch(e){
  if(e?.status&&typeof e.code==="string"&&e.code.startsWith("US_ODOO_"))throw e;
  throw problem("US_ODOO_APPROVED_SOURCE_READBACK_UNAVAILABLE",503);
 }
}
export async function registerApprovedUsOdooSalon({pool,body,headers,query,
 env=process.env,createClient=createUsOdooApprovedSourceClient,createExistingOpeningRequest}={}){
 if(!usOdooIntakeEnabled(env))throw problem("ADMIN_US_ODOO_INTAKE_HOLD");
 assertUsOdooIntakeHeader(headers,query,env);
 const leadId=hintId(body);
 if(typeof createExistingOpeningRequest!=="function")throw problem("US_ODOO_INTAKE_CALLBACK_REQUIRED",500);
 let url;try{url=new URL(env.TOTEM_US_ODOO_URL);}catch{throw problem("US_ODOO_SOURCE_CONFIG_REQUIRED",503);}
 if(url.origin!=="https://totem-platform.odoo.com"||url.pathname!=="/"||url.search||url.hash||url.username||url.password||
    env.TOTEM_US_ODOO_DB!=="totem-platform"||!str(env.TOTEM_US_ODOO_USER)||!str(env.TOTEM_US_ODOO_API_KEY))
   throw problem("US_ODOO_SOURCE_CONFIG_REQUIRED",503);
 let verified;
 return registerVerifiedUsOdooSource({pool,candidate:leadId,
   readVerifiedOdooSource:async candidate=>{
    verified=await readUsApprovedOdooSalonSource(candidate,{client:createClient({
      baseUrl:env.TOTEM_US_ODOO_URL,database:env.TOTEM_US_ODOO_DB,
      username:env.TOTEM_US_ODOO_USER,apiKey:env.TOTEM_US_ODOO_API_KEY})});
    return verified.proof;
   },
   assertExisting:async existing=>{
    const saved=existing.precheck_result_json?.odoo_source_proof;
    if(saved?.odoo_lead_id!==verified.provenance.odoo_lead_id||
       saved?.source_request_id!==verified.proof.source_request_id)
      throw problem("US_ODOO_EXISTING_SOURCE_REVIEW_REQUIRED");
   },
   createExistingOpeningRequest:(db,proof)=>createExistingOpeningRequest(db,verified,proof),
 });
}
