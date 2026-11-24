// G3 V2: verify operator-attested evidence. Not an independent Odoo reader.
import {createPublicKey,verify,createHash} from "node:crypto";
import {canonicalBytes,parseCanonical,signingBytes,unsignedBody,exact,same,isId,EVIDENCE_KEYS,VERSION} from "./usG3ManualEvidenceWire.js";
import {canonicalG3Projection,hashG3Projection,checkLead,checkPartner,checkProjectionLead,buildVerifiedG3Roles,usOdooIntakeEnabled,assertUsOdooIntakeHeader} from "./usApprovedOdooSalonIntake.js";
import {LEAD_FIELDS,PROFILE_FIELDS} from "../billing/usOdooReadOnlyClient.js";
const problem=(reason,status=409)=>Object.assign(Error("US_ODOO_G3_MANUAL_"+reason),{code:"US_ODOO_G3_MANUAL_"+reason,status});
const deny=(reason)=>{throw problem(reason);};
const req=(x,r)=>{if(!x)deny(r);};
const rel=x=>Array.isArray(x)&&x.length===2&&isId(x[0])&&typeof x[1]==="string"?x[0]:0;
const W=["module","name","model","res_id","noupdate"],S=["id","country_id","code"];
const stamp=v=>typeof v==="string"&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(v)?Date.parse(v.replace(" ","T")+"Z"):NaN;
const oneLead=(arr,l)=>Array.isArray(arr)&&arr.length===1&&same(exact(arr[0],LEAD_FIELDS),l);
const signedKey=(env,kid)=>{
 req(typeof kid==="string"&&/^[A-Za-z0-9_-]{1,64}$/.test(kid)&&kid===env.TOTEM_US_ODOO_G3_MANUAL_EVIDENCE_KID,"KEY");
 let key;try{key=createPublicKey(env.TOTEM_US_ODOO_G3_MANUAL_EVIDENCE_PUBLIC_KEY_PEM);}catch{deny("KEY");}
 req(key.asymmetricKeyType==="ed25519","KEY");return key;
};
const MANUAL_EVIDENCE_CODE_RELEASE_APPROVED=false;
export function manualG3EvidenceEnabled(env=process.env){
 return MANUAL_EVIDENCE_CODE_RELEASE_APPROVED&&usOdooIntakeEnabled(env)&&env.TOTEM_US_ODOO_G3_OWNER_ADMIN_REVIEW_APPROVED==="true"&&
  env.TOTEM_US_ODOO_G3_MANUAL_EVIDENCE_RELEASE_APPROVED==="true";
}
// This module does not register routes or perform writes. Downstream callers MUST check
// authenticated admin session and lock/bind the current request before consuming roles.
export async function verifyManualG3Evidence(raw,{purpose,requestId=null,headers,query,env=process.env,now=()=>Date.now(),readVerifiedTargetGeo}={}){
 if(!manualG3EvidenceEnabled(env))throw problem("RELEASE_HOLD");
 if(purpose==="intake")assertUsOdooIntakeHeader(headers,query,env);
 req(["intake","approve","provision"].includes(purpose),"PURPOSE");
 const b=parseCanonical(raw),u=unsignedBody(b),e=exact(b.evidence,EVIDENCE_KEYS);
 req(b._model==="crm.lead"&&b.market_code==="US"&&b.evidence_version===VERSION&&isId(b._id),"SCOPE");
 req(typeof b.signature==="string"&&/^[A-Za-z0-9_-]{86}$/.test(b.signature),"SIGNATURE");
 const sig=Buffer.from(b.signature,"base64url");
 req(sig.length===64&&sig.toString("base64url")===b.signature&&verify(null,signingBytes(u),signedKey(env,b.kid),sig),"SIGNATURE");
 req(e.purpose===purpose&&e.request_id===requestId&&(purpose==="intake"?requestId===null:isId(requestId)),"PURPOSE");
 req(e.installation==="totem-platform"&&e.company_id===4&&e.website_id===5&&e.team_id===8&&e.actor_uid===2,"SCOPE");
 const a=e.observed_start_ms,z=e.observed_end_ms,t=now();
 req(isId(a)&&isId(z)&&isId(t)&&z>=a&&z-a<=15000&&z<=t+2000&&t-z<=15000,"FRESHNESS");
 const l=exact(e.lead,LEAD_FIELDS),p=exact(e.partner,PROFILE_FIELDS);
 const pid=rel(l.x_totem_us_source_partner_id);
 req(pid&&p.id===pid&&oneLead(e.partner_leads,l)&&oneLead(e.lead_repeat,l)&&same(exact(e.partner_repeat,PROFILE_FIELDS),p),"REPEAT");
 checkLead(l,b._id,pid);checkPartner(p,pid,l);
 // No other approver accepted in this one-admin model.
 const d=canonicalG3Projection(p,{reviewerIds:[2],now:a,env}),h=hashG3Projection(d);
 req(d.approved_by_id===2,"APPROVER");
 const w=exact(e.witness,W),wr=exact(e.witness_repeat,W);
 req(w.module==="totem_us_bridge"&&w.name==="company4_site5_partner_"+pid&&w.model==="crm.lead"&&w.res_id===b._id&&w.noupdate===true&&same(w,wr)&&same(e.witness_reference,["crm.lead",b._id])&&same(e.witness_reference_repeat,e.witness_reference),"WITNESS");
 let target=null,targetSeal=null,state=null,country=null,geo=null;
 if(d.mode==="existing_salon"){
  req(e.state===null&&e.state_repeat===null,"BRANCH");
  target=exact(e.target,PROFILE_FIELDS);
  req(same(target,exact(e.target_repeat,PROFILE_FIELDS))&&target.id===d.target_salon_partner_id&&target.x_totem_us_account_kind==="salon"&&target.x_totem_us_business_slug===d.target_salon_slug,"TARGET");
  const td=canonicalG3Projection(target,{reviewerIds:[2],now:a,env});
  req(td.approved_by_id===2,"APPROVER");
  targetSeal={revision:td.revision,hash:hashG3Projection(td)};
  req(typeof readVerifiedTargetGeo==="function","TARGET_GEO");
  geo=await readVerifiedTargetGeo(d.target_salon_slug);
  req(geo?.slug===d.target_salon_slug&&geo.market_code==="US"&&geo.verified===true&&typeof geo.city==="string"&&geo.city.length>0&&geo.city===geo.city.trim()&&geo.city===geo.city.normalize("NFC"),"TARGET_GEO");
 }else{
  req(e.target===null&&e.target_repeat===null,"BRANCH");
  state=exact(e.state,S);
  req(same(state,exact(e.state_repeat,S))&&state.id===d.business_state_id&&rel(state.country_id)===233&&state.code===d.business_state_code,"STATE");
  country=233;
 }
 checkProjectionLead(l,d,country,h);
 req(Number.isFinite(stamp(l.write_date))&&Number.isFinite(stamp(p.write_date)),"TIME");
 const done=now();req(isId(done)&&done>=t&&done-z<=15000&&done-t<=15000,"FRESHNESS");
 const roles=buildVerifiedG3Roles({leadId:b._id,partner:pid,lead:l,p,d,h,target,targetSeal,geo});
 const attestation=Object.freeze({authority_mode:"owner_admin_attested_readback_v2",authority_kid:b.kid,evidence_digest:createHash("sha256").update(canonicalBytes(b)).digest("hex"),observed_start_ms:a,observed_end_ms:z,purpose,request_id:requestId});
 return Object.freeze(roles.map(r=>Object.freeze({...r,provenance:Object.freeze({...r.provenance,...attestation})})));
}
