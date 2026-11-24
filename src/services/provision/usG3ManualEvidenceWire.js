// G3 V2 restricted RFC 8785 wire encoding, shared by signer and verifier.
export const VERSION="g3_owner_admin_evidence_v2";
export const MAX_WIRE_BYTES=262144;
const PREFIX=Buffer.from("TOTEM-US-G3-EVIDENCE-V2\0","utf8");
const err=()=>{throw Object.assign(Error("US_ODOO_G3_EVIDENCE_INVALID"),{code:"US_ODOO_G3_EVIDENCE_INVALID",status:409});};
export const exact=(v,keys)=>{if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))err();return v;};
export const isId=v=>Number.isSafeInteger(v)&&v>0;
export const EVIDENCE_KEYS=Object.freeze(["purpose","request_id","installation","company_id","website_id","team_id","actor_uid","observed_start_ms","observed_end_ms","lead","partner","target","state","witness","partner_leads","lead_repeat","partner_repeat","target_repeat","state_repeat","witness_repeat","witness_reference","witness_reference_repeat"]);
export const BODY_KEYS=Object.freeze(["_model","_id","market_code","evidence_version","evidence","kid","signature"]);
export const unsignedKeys=Object.freeze(BODY_KEYS.filter(k=>k!=="signature"));
function text(s){if(typeof s!=="string"||s!==s.normalize("NFC")||/[\uD800-\uDFFF]/u.test(s))err();return JSON.stringify(s);}
function encode(v,depth=0){
 if(depth>24)err();
 if(v===null||typeof v==="boolean")return JSON.stringify(v);
 if(typeof v==="string")return text(v);
 if(typeof v==="number"){if(!Number.isSafeInteger(v))err();return JSON.stringify(v);}
 if(Array.isArray(v))return "["+v.map(x=>encode(x,depth+1)).join(",")+"]";
 if(!v||Object.getPrototypeOf(v)!==Object.prototype)err();
 return "{"+Object.keys(v).sort().map(k=>text(k)+":"+encode(v[k],depth+1)).join(",")+"}";
}
export function canonicalBytes(v){const b=Buffer.from(encode(v),"utf8");if(b.length>MAX_WIRE_BYTES)err();return b;}
export function parseCanonical(raw){if(!Buffer.isBuffer(raw)||!raw.length||raw.length>MAX_WIRE_BYTES)err();let v;try{v=JSON.parse(new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(raw));}catch{err();}
 // A duplicate key, noncanonical escapes, BOM, whitespace or numeric spelling cannot survive exact re-encoding.
 if(!canonicalBytes(v).equals(raw))err();return v;}
export function unsignedBody(b){exact(b,BODY_KEYS);return Object.fromEntries(unsignedKeys.map(k=>[k,b[k]]));}
export function signingBytes(u){exact(u,unsignedKeys);return Buffer.concat([PREFIX,canonicalBytes(u)]);}
export function same(a,b){return canonicalBytes(a).equals(canonicalBytes(b));}
