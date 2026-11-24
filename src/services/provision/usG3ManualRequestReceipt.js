// V2 manual evidence is a trusted operator attestation, not an independent Odoo read.
// Preparation is outside the DB transaction; consumption is bound to a locked request.
import {verifyManualG3Evidence,manualG3EvidenceEnabled} from "./usG3ManualEvidenceVerifier.js";
import {createG3TargetGeoReader,usOdooIntakeEnabled} from "./usApprovedOdooSalonIntake.js";
import {sameG3Seal} from "./usOdooG3SealProof.js";
import {US_COUNTRY_PACK} from "../../market-context/country-packs/US.js";
const MODE="owner_admin_attested_readback_v2";
const receipts=new WeakSet();
const fail=()=>{throw Object.assign(Error("US_ODOO_G3_MANUAL_REQUEST_PROOF_REQUIRED"),{code:"US_ODOO_G3_MANUAL_REQUEST_PROOF_REQUIRED",status:409});};
const id=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):0;
const str=x=>String(x??"");
const proof=r=>r?.precheck_result_json?.odoo_source_proof;
export const isManualG3Request=r=>proof(r)?.authority_mode===MODE||
 (r?.source_namespace==="odoo_online"&&proof(r)?.source_approved_by_id===2);
// Explicit source scope also blocks an incomplete or mislabeled imported USA row.
export const isScopedUsOdooRequest=r=>Boolean(r?.source_namespace==="odoo_online"&&
 (Number(r.source_company_id)===4||Number(r.source_website_id)===5||
  String(r?.precheck_result_json?.normalized?.market_code??r?.precheck_result_json?.market_code??"").trim().toUpperCase()==="US"));
export function assertUsOdooDispatchHold(r,env=process.env){
 if(isScopedUsOdooRequest(r)&&!usOdooIntakeEnabled(env))
  throw Object.assign(Error("US_ODOO_DISPATCH_RELEASE_HOLD"),{code:"US_ODOO_DISPATCH_RELEASE_HOLD",status:409});
}
export const hasManualG3Envelope=b=>Boolean(b&&typeof b==="object"&&
 ["evidence_version","evidence","kid","signature"].some(k=>Object.hasOwn(b,k)));
const keys=["source","odoo_lead_id","source_partner_id","source_request_id","source_stage_id","source_marker","entry_mode","role_set","target_salon_partner_id","target_salon_slug","target_source_revision","target_source_hash","authority_mode","authority_kid"];
function compare(r,v){
 const p=proof(r),a=v?.provenance,i=v?.intake;
 const n=r?.precheck_result_json?.normalized;
 if(!p||!a||!i||!n||p.authority_mode!==MODE||a.authority_mode!==MODE||
 r.source_namespace!=="odoo_online"||Number(r.source_company_id)!==4||Number(r.source_website_id)!==5||
 n.market_code!=="US"||r.owner_type!==i.owner_type||v.proof.owner_type!==r.owner_type||
 id(r.source_partner_id)!==v.proof.partner_id||r.source_request_id!==v.proof.source_request_id||
 !sameG3Seal(p,a)||keys.some(k=>(p[k]??null)!==(a[k]??null))||
 r.slug_final!==i.slug_requested||r.name!==i.name||r.email!==i.email||
 r.phone_normalized!==US_COUNTRY_PACK.normalizeBusinessPhone(i.phone).phone||
 str(r.city)!==str(i.city)||str(r.address)!==str(i.address)||str(r.description)!==str(i.description)||
 (r.owner_type==="master"&&(r.salon_slug!==i.salon_slug||r.work_mode!=="attached_to_salon"||str(r.specialization)!==str(i.specialization)))||
 (r.owner_type==="salon"&&(n.state_code!==i.state_code||n.postal_code!==i.postal_code)))fail();
}
export async function prepareManualG3RequestReceipt(db,requestId,{raw,purpose,admin,env=process.env}={}){
 if(!manualG3EvidenceEnabled(env)||!id(requestId)||!id(admin?.user_id)||admin?.role!=="admin"||!admin?.session_id)fail();
 const roles=await verifyManualG3Evidence(raw,{purpose,requestId,env,readVerifiedTargetGeo:createG3TargetGeoReader(db)});
 const r=(await db.query("SELECT * FROM public.owner_opening_requests WHERE id=$1",[requestId])).rows[0];
 if(!isManualG3Request(r)||!(purpose==="approve"?["validated","approved"].includes(r.status):["approved","provisioned"].includes(r.status)))fail();
 const v=roles.find(x=>x.proof.owner_type===r.owner_type);compare(r,v);
 const receipt=Object.freeze({requestId,adminId:id(admin.user_id),sessionId:String(admin.session_id),purpose,verified:v,at:Date.now()});
 receipts.add(receipt);return receipt;
}
export function assertManualG3RequestReceipt(r,receipt,{purpose,admin,env=process.env}={}){
 assertUsOdooDispatchHold(r,env);
 if(!isManualG3Request(r)){if(receipt)fail();return false;}
 const now=Date.now();
 if(!manualG3EvidenceEnabled(env)||!receipt||!receipts.has(receipt)||receipt.requestId!==id(r.id)||
 receipt.adminId!==id(admin?.user_id)||receipt.sessionId!==String(admin?.session_id??"")||admin?.role!=="admin"||
 receipt.purpose!==purpose||now<receipt.at||now-receipt.at>15000||
 now-receipt.verified.provenance.observed_end_ms>15000||
 !(purpose==="approve"?["validated","approved"].includes(r.status):["approved","provisioned"].includes(r.status)))fail();
 compare(r,receipt.verified);return true;
}
