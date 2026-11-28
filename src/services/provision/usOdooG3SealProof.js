// Stable G3 seal proof. Timestamp write_date is diagnostic only.
const id=v=>Number.isSafeInteger(v)&&v>0;
export const G3_SEAL_KEYS=Object.freeze(["source_schema","source_revision","source_hash","source_approved_at","source_approved_by_id","source_external_id"]);
// Owner-administrator exception is explicit, scoped and disabled by default.
// This validates provenance only, not native Odoo authorization or seal immutability.
export function validG3ApproverId(uid,env=process.env){
 return id(uid)&&(uid>2||(uid===2&&
  env.TOTEM_US_ODOO_G3_OWNER_ADMIN_REVIEW_APPROVED==="true"&&
  String(env.TOTEM_US_ODOO_G3_REVIEWER_UIDS??"").split(",").map(Number).includes(2)));
}
export function validG3Seal(p){
 if(!p||p.source_schema!=="g3_source_v1"||p.source_revision!=="1"||!id(p.source_partner_id)||!validG3ApproverId(p.source_approved_by_id)||
 typeof p.source_hash!=="string"||!/^[0-9a-f]{64}$/.test(p.source_hash)||p.source_external_id!=="totem_us_bridge.company4_site5_partner_"+p.source_partner_id||
 typeof p.source_approved_at!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(p.source_approved_at))return false;
 const t=Date.parse(p.source_approved_at);
 return !p.source_approved_at.startsWith("0000-")&&Number.isFinite(t)&&new Date(t).toISOString().replace(".000Z","Z")===p.source_approved_at;
}
export function sameG3Seal(a,b){return validG3Seal(a)&&validG3Seal(b)&&a.source_partner_id===b.source_partner_id&&G3_SEAL_KEYS.every(k=>a[k]===b[k]);}
