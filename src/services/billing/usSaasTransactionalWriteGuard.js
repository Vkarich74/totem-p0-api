// T5: US-only commercial gate, called by an existing business transaction
// AFTER ownerContext(...,true) has locked the US owner/market/session rows.
// No pool acquisition, caller market claims, wallet fallback or side effects.
// Recheck after mutation before caller COMMIT: denial forces transaction rollback.
import {getUsSaasAccess,readUsSaasProjectionPolicy} from "./usSaasEntitlementProjection.js";
export async function checkUsSaasTransactionalWrite(db,ownerType,scope){
 const id=Number(scope?.owner_id),marketId=Number(scope?.market_id);
 if(!db||typeof db.query!=="function"||!["salon","master"].includes(ownerType)||
    !Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(marketId)||marketId<1)
   return {status:403,body:{ok:false,error:"US_SAAS_COMMERCIAL_SCOPE_INVALID"}};
 const access=await getUsSaasAccess(db,{ownerType,ownerId:id,policy:readUsSaasProjectionPolicy(),lock:true});
 if(access?.managed!==true||access.can_write!==true)
   return {status:403,body:{ok:false,error:"US_SAAS_COMMERCIAL_ACCESS_DENIED",reason:access?.reason||"US_SAAS_ENTITLEMENT_INVALID"}};
 return null;
}
