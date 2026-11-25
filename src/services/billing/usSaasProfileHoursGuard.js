// T5: commercial authority for shared profile routes and explicit US hours.
// Only existing transaction clients. KG-only legacy semantics remain intact.
// A globally shared master name cannot be independently changed in two markets.
import {checkUsSaasTransactionalWrite} from "./usSaasTransactionalWriteGuard.js";
import {actorFor,checkSession,ownerContext} from "../usServiceTaxSettings.service.js";

const id=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
const problem=(code,statusCode=409)=>Object.assign(Error(code),{code,statusCode});
export const isUsProfileGuardError=e=>Number.isInteger(e?.statusCode)&&/^US_(?:PROFILE|SAAS|HOURS)_/.test(String(e.code));
export async function classifyLockedProfileScope(db,ownerType,ownerId){
 if(!["salon","master"].includes(ownerType)||!id(ownerId))throw problem("US_PROFILE_SCOPE_INVALID");
 // The caller holds the existing owner row lock (or locks it here for legacy hours).
 const owner=await db.query(ownerType==="salon"?
   "SELECT id FROM public.salons WHERE id=$1 FOR SHARE":
   "SELECT id FROM public.masters WHERE id=$1 FOR SHARE",[id(ownerId)]);
 if(owner.rows.length!==1)throw problem("US_PROFILE_SCOPE_INVALID");
 const relations=ownerType==="master"?await db.query("SELECT id,salon_id FROM public.master_salon WHERE master_id=$1 AND status='active' ORDER BY id FOR SHARE",[id(ownerId)]):null;
 const markets=await db.query(ownerType==="salon"?
   "SELECT m.id AS market_id,m.code,m.country_code,m.active,COALESCE(t.currency_override,m.default_currency) AS currency_code FROM public.tenant_market_settings t JOIN public.markets m ON m.id=t.market_id WHERE t.salon_id=$1 FOR SHARE OF t,m":
   "SELECT m.id AS market_id,m.code,m.country_code,m.active,COALESCE(t.currency_override,m.default_currency) AS currency_code FROM public.master_salon ms JOIN public.tenant_market_settings t ON t.salon_id=ms.salon_id JOIN public.markets m ON m.id=t.market_id WHERE ms.master_id=$1 AND ms.status='active' ORDER BY m.id,ms.id FOR SHARE OF ms,t,m",[id(ownerId)]);
 const source=await db.query("SELECT id FROM public.owner_opening_requests WHERE owner_type=$1 AND created_owner_id=$2 AND source_namespace='odoo_online' AND (source_company_id=4 OR source_website_id=5 OR upper(trim(COALESCE(precheck_result_json->'normalized'->>'market_code',precheck_result_json->>'market_code','')))='US') ORDER BY id LIMIT 2 FOR SHARE",[ownerType,id(ownerId)]);
 const projected=await db.query("SELECT id FROM public.billing_subscriptions WHERE owner_type=$1 AND owner_id=$2 AND provider_namespace='odoo_online' AND (provider_company_id=4 OR provider_website_id=5) ORDER BY id LIMIT 2 FOR SHARE",[ownerType,id(ownerId)]);
 const us=markets.rows.filter(r=>r.code==="US"),other=markets.rows.filter(r=>r.code!=="US");
 const managed=us.length>0||source.rows.length>0||projected.rows.length>0;
 if(!managed)return {kind:"legacy"};
 if(other.length)throw problem("US_PROFILE_MIXED_MARKET_HOLD");
 if(relations&&relations.rows.length!==markets.rows.length)throw problem("US_PROFILE_MARKET_BINDING_INVALID");
 const ids=new Set(us.map(r=>id(r.market_id)));
 if(!us.length||ids.size!==1||ids.has(0)||us.some(r=>r.country_code!=="US"||r.currency_code!=="USD"||r.active!==true))
   throw problem("US_PROFILE_MARKET_BINDING_INVALID");
 return {kind:"us",market_id:us[0].market_id,owner_id:id(ownerId)};
}
async function requireUsOwner(db,{req,ownerType,ownerId,marketId}){
 const actor=actorFor(req?.auth,req?.identity,ownerType);
 if(!actor||!await checkSession(db,actor,true))throw problem("US_PROFILE_SESSION_INVALID",403);
 const scope=await ownerContext(db,ownerType,req.params.slug,actor.userId,true);
 if(!scope||id(scope.owner_id)!==id(ownerId)||id(scope.market_id)!==id(marketId))
   throw problem("US_PROFILE_OWNER_SCOPE_INVALID",403);
 const denied=await checkUsSaasTransactionalWrite(db,ownerType,scope);
 if(denied)throw problem(denied.body.error,denied.status);
}
export async function assertProfileWriteScope(db,{req,ownerType,ownerId,expectedKind}){
 const scope=await classifyLockedProfileScope(db,ownerType,ownerId);
 if(expectedKind&&scope.kind!==expectedKind)throw problem("US_PROFILE_MARKET_SCOPE_CHANGED");
 if(scope.kind==="us")await requireUsOwner(db,{req,ownerType,ownerId,marketId:scope.market_id});
 return scope.kind;
}
export async function assertUsHoursWriteScope(db,{req,masterId,location}){
 if(!id(location?.market_id)||!id(location?.salon_id)||!id(location?.location_id))throw problem("US_HOURS_SCOPE_INVALID");
 // Caller holds the exact US relation/location/market locks and advisory
 // booking lock. Do not classify a location-scoped schedule as global profile.
 await requireUsOwner(db,{req,ownerType:"master",ownerId:masterId,marketId:location.market_id});
}
export async function assertLegacySalonHoursScope(db,salonId){
 const scope=await classifyLockedProfileScope(db,"salon",salonId);
 if(scope.kind!=="legacy")throw problem("US_HOURS_EXPLICIT_LOCATION_REQUIRED");
}
