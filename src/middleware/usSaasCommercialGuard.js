// G5-T5: one early internal write guard for scoped US SaaS business actions.
// Does not affect auth, Odoo checkout/renewal, or KG/KZ legacy businesses.
import { getUsSaasAccess,readUsSaasProjectionPolicy } from
  "../services/billing/usSaasEntitlementProjection.js";

import {readUsOwnSalonProfileAccess} from "../auth/usOwnSalonRoleContext.js";

function ownerType(value){
  const s=String(value||"").toLowerCase();
  return s==="salon"||s==="salon_admin"?"salon":s==="master"?"master":null;
}
function matchOwnerPath(path){
  const value=String(path||"").split("?")[0];
  let match=value.match(/^\/(salons|masters)\/([^/]+)(?:\/|$)/i);
  if(match)return {type:match[1]==="salons"?"salon":"master",slug:match[2]};
  match=value.match(/^\/us-service-(?:tax|prices|links)\/(salon|salon_admin|master)\/([^/]+)(?:\/|$)/i);
  if(match)return {type:ownerType(match[1]),slug:match[2]};
  match=value.match(/^\/us-pay-c11\/live-connect\/(salon|salon_admin|master)\/(\d+)(?:\/|$)/i);
  if(match)return {type:ownerType(match[1]),id:Number(match[2])};
  match=value.match(/^\/us-pay-c11\/bookings\/(\d+)(?:\/|$)/i);
  if(match)return {bookingId:Number(match[1])};
  return null;
}
function isLegacyWalletPath(path){
  return /^\/(?:salons|masters)\/[^/]+\/(?:subscription\/charge|billing\/(?:block|unblock))(?:\/|$)/i.test(path);
}
function safeInternalNonCommercialMutation(path){
  return /^\/(?:salons|masters)\/[^/]+\/(?:notifications\/[^/]+\/read|push-subscriptions)(?:\/|$)/i.test(path);
}
function maxPath(path){return typeof path==="string"?path:"";}
async function resolveOwner(pool,ref){
  if(ref.id)return {type:ref.type,id:ref.id};
  if(ref.slug){
    let safe;
    try{safe=decodeURIComponent(ref.slug);}catch{return null;}
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(safe))return null;
    const table=ref.type==="salon"?"public.salons":"public.masters";
    const result=await pool.query("SELECT id FROM "+table+" WHERE slug=$1 LIMIT 1",[safe]);
    return result.rows.length?{type:ref.type,id:Number(result.rows[0].id)}:null;
  }
  if(ref.bookingId){
    const result=await pool.query(
      "SELECT salon_id FROM public.bookings WHERE id=$1 LIMIT 1",[ref.bookingId]);
    return result.rows.length&&result.rows[0].salon_id?
      {type:"salon",id:Number(result.rows[0].salon_id)}:null;
  }
  return null;
}
export function classifyUsSaasInternalWrite(path,method){
  if(["GET","HEAD","OPTIONS"].includes(String(method||"GET").toUpperCase()))
    return {action:"READ"};
  if(safeInternalNonCommercialMutation(path))
    return {action:"SAFE_OWNER_PREFERENCES"};
  const matched=matchOwnerPath(path);
  if(!matched)return {action:"OUT_OF_SCOPE"};
  return {
    action:isLegacyWalletPath(path)?"WALLET_BILLER":"COMMERCIAL_WRITE",
    target:matched,
  };
}
export function buildUsSaasCommercialGuard(pool,{
  readAccess=getUsSaasAccess,
  getPolicy=readUsSaasProjectionPolicy,
}={}){
  if(!pool||typeof pool.query!=="function")throw Error("US_SAAS_POOL_REQUIRED");
  return async(req,res,next)=>{
    const path=maxPath(req.path);
    if(path.length>400)return res.status(414).json({ok:false,error:"US_SAAS_ROUTE_TOO_LONG"});
    const c=classifyUsSaasInternalWrite(path,req.method);
    if(["READ","OUT_OF_SCOPE","SAFE_OWNER_PREFERENCES"].includes(c.action))
      return next();
    try{
      const owner=await resolveOwner(pool,c.target);
      if(!owner)return res.status(404).json({ok:false,error:"OWNER_NOT_FOUND"});
      // No generic master projection or wallet fallback for shared profiles.
      // The handler repeats this decision under the actual write transaction.
      if(req.auth?.us_role_context==="own_salon_master_v1"){
        if(c.action!=="COMMERCIAL_WRITE"||c.target.type!=="master"||
          String(req.method).toUpperCase()!=="PATCH"||path!=="/masters/"+req.auth.master_slug)
          return res.status(403).json({ok:false,error:"US_ROLE_CONTEXT_ROUTE_HOLD"});
        const shared=await readUsOwnSalonProfileAccess(pool,{auth:req.auth,slug:c.target.slug});
        if(shared.masterId!==owner.id)
          return res.status(403).json({ok:false,error:"US_ROLE_CONTEXT_PROFILE_SCOPE"});
        return next();
      }
      const checked=await readAccess(pool,{
        ownerType:owner.type,ownerId:owner.id,policy:getPolicy(),
      });
      if(!checked.managed)return next();
      if(c.action==="WALLET_BILLER")
        return res.status(409).json({
          ok:false,error:"US_ODOO_SAAS_LEGACY_WALLET_BILLING_FORBIDDEN",
        });
      if(!checked.can_write)
        return res.status(403).json({
          ok:false,error:"US_SAAS_COMMERCIAL_ACCESS_DENIED",
          reason:checked.reason||"US_SAAS_ENTITLEMENT_INVALID",
        });
      return next();
    }catch(err){
      if(req.auth?.us_role_context==="own_salon_master_v1"&&[403,409].includes(err?.status))
        return res.status(403).json({ok:false,error:"US_SAAS_COMMERCIAL_ACCESS_DENIED"});
      // Never turn a failed data read into a paid business write.
      return res.status(503).json({ok:false,error:"US_SAAS_GUARD_UNAVAILABLE"});
    }
  };
}
