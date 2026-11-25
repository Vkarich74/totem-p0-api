// Shared canonical public/manual US booking transaction only. No payment.
import {getUsSaasAccess,readUsSaasProjectionPolicy} from "./usSaasEntitlementProjection.js";
import {actorFor,checkSession} from "../usServiceTaxSettings.service.js";
const id=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
const fail=(code,statusCode=409)=>Object.assign(Error(code),{code,statusCode});
export async function assertUsManualBookingSession(db,req,masterId,masterSlug){
 const actor=actorFor(req?.auth,req?.identity,"master");
 if(!actor||!id(masterId)||typeof masterSlug!=="string"||!masterSlug||!await checkSession(db,actor,true))
   throw fail("US_MANUAL_MASTER_SESSION_INVALID",403);
 const r=await db.query("SELECT id FROM public.masters WHERE id=$1 AND slug=$2 AND user_id=$3 AND active=true FOR SHARE",[id(masterId),masterSlug,actor.userId]);
 if(r.rows.length!==1)throw fail("US_MANUAL_MASTER_SCOPE_CHANGED",403);
}
export async function assertUsBookingAuthority(db,{salonId,masterId,serviceLinkId,marketContext,location}={}){
 if(!id(salonId)||!id(masterId)||!id(serviceLinkId)||!id(location?.id)||!id(marketContext?.market_id)||
   marketContext.market_code!=="US"||marketContext.country_code!=="US"||marketContext.currency_code!=="USD")
   throw fail("US_BOOKING_AUTHORITY_SCOPE_INVALID");
 const locked=await db.query(
 "SELECT s.id FROM public.salons s JOIN public.master_salon ms ON ms.salon_id=s.id "+
 "JOIN public.masters m ON m.id=ms.master_id JOIN public.tenant_market_settings t ON t.salon_id=s.id "+
 "JOIN public.markets mk ON mk.id=t.market_id JOIN public.us_salon_locations l ON l.salon_id=s.id "+
 "JOIN public.salon_master_services sms ON sms.salon_id=s.id AND sms.master_id=m.id "+
 "WHERE s.id=$1 AND m.id=$2 AND sms.id=$3 AND l.id=$4 AND mk.id=$5 "+
 "AND l.location_code=$6 AND l.timezone_name=$7 AND l.enabled=true "+
 "AND s.status='active' AND s.enabled=true AND m.active=true AND ms.status='active' "+
 "AND sms.active=true AND sms.currency_code='USD' AND mk.code='US' AND mk.country_code='US' AND mk.active=true "+
 "AND mk.country_pack_code='US' AND mk.country_pack_version='1' AND COALESCE(t.currency_override,mk.default_currency)='USD' "+
 "LIMIT 2 FOR SHARE OF s,ms,m,t,mk,l,sms",
 [id(salonId),id(masterId),id(serviceLinkId),id(location.id),id(marketContext.market_id),location.location_code,location.timezone]);
 if(locked.rows.length!==1)throw fail("US_BOOKING_AUTHORITY_SCOPE_CHANGED");
 for(const [ownerType,ownerId] of [["salon",id(salonId)],["master",id(masterId)]]){
  const access=await getUsSaasAccess(db,{ownerType,ownerId,policy:readUsSaasProjectionPolicy(),lock:true});
  if(access?.managed!==true||access.can_book!==true)throw fail("US_BOOKING_COMMERCIAL_ACCESS_DENIED",403);
 }
}
