// US-only Admin route adapter. Legacy handlers never call this adapter.
// Hard release fence is evaluated before any external proof, DB or mail I/O.
import {assertUsCommercialWriterReleased} from "../../services/provision/usCommercialWriterRelease.js";
import {isScopedUsOdooRequest,prepareManualG3RequestReceipt} from "../../services/provision/usG3ManualRequestReceipt.js";
import {prepareUsImportedMasterReceipt} from "../../services/provision/usImportedMasterProvision.js";
import {isUsOwnSalonMaster} from "../../services/provision/usOwnSalonCanonicalActivation.js";
import {prepareUsPaidActivationEvidence} from "../../services/provision/usPaidOwnerOpeningGate.js";
import {activateOwnerOpeningCanonical} from "../../services/provision/ownerOpeningCanonicalActivation.js";
import {claimOwnerOpeningWelcome,finalizeOwnerOpeningWelcomeSent,markOwnerOpeningWelcomeUncertain,reconcileOwnerOpeningWelcomeSent} from "../../services/notifications/ownerOpeningWelcomeIntent.js";
import {requestMarketCode} from "../../services/provision/usOpenOwnerGuards.js";

const fail=(code,status=409)=>Object.assign(Error(code),{code,status});
export function isUsAdminCommercialRoute(request){
 return isScopedUsOdooRequest(request);
}
function assertScope(r,requestId,sourceAdmin){
 if(!isUsAdminCommercialRoute(r)||requestMarketCode(r)!=="US"||
    Number(r.source_company_id)!==4||Number(r.source_website_id)!==5||
    Number(r.id)!==Number(requestId)||sourceAdmin?.role!=="admin"||
    !Number.isSafeInteger(Number(sourceAdmin.user_id))||Number(sourceAdmin.user_id)<=0||
    typeof sourceAdmin.session_id!=="string"||!sourceAdmin.session_id)
   throw fail("US_G3_ADMIN_SOURCE_SCOPE_INVALID");
}
export function assertUsAdminWelcomePreview({request,requestId,sourceAdmin}={}){
 assertUsCommercialWriterReleased("welcome");
 assertScope(request,requestId,sourceAdmin);
 if(request.owner_type==="master")throw fail("US_ODOO_MASTER_ROLE_COMMERCIAL_CONTRACT_HOLD");
 if(!["activated","email_ready"].includes(request.status))throw fail("OWNER_OPENING_REQUEST_STATUS_INVALID");
 if(request.message_id!=null||request.email_sent_at||["sent","failed"].includes(request.email_status))
   throw fail("OWNER_OPENING_WELCOME_RECONCILIATION_REQUIRED");
}
function assertPaid(paid){
 if(paid?.status!=="PAID_VERIFIED"||paid.canActivate!==true)
   throw fail("US_ODOO_PAID_ENTITLEMENT_REQUIRED");
}
export async function activateUsAdminRequest({pool,request,requestId,sourceAdmin,admin,raw,callbacks}={}){
 assertUsCommercialWriterReleased("activation");
 assertScope(request,requestId,sourceAdmin);
 // No second paid order for own-salon shared Master; use the same fresh
 // activation receipt for the master-specific relation check, never provision.
 const sourceReceipt=await prepareManualG3RequestReceipt(pool,requestId,{raw,purpose:"activate",admin:sourceAdmin});
 let paidEvidence=null,masterReceipt=null;
 if(isUsOwnSalonMaster(request)){
   masterReceipt=await prepareUsImportedMasterReceipt(pool,requestId,{manualReceipt:sourceReceipt,purpose:"activate",admin:sourceAdmin});
 }else{
   if(request.owner_type==="master")throw fail("US_ODOO_MASTER_ROLE_COMMERCIAL_CONTRACT_HOLD");
   paidEvidence=await prepareUsPaidActivationEvidence(request);
   assertPaid(paidEvidence);
 }
 return activateOwnerOpeningCanonical({...callbacks,pool,requestId,admin,sourceAdmin,sourceReceipt,paidEvidence,masterReceipt,requireUsScope:true});
}
export async function sendUsAdminWelcome({pool,request,requestId,sourceAdmin,admin,raw,callbacks,sendEmail}={}){
 assertUsCommercialWriterReleased("welcome");
 assertScope(request,requestId,sourceAdmin);
 if(request.owner_type==="master")throw fail("US_ODOO_MASTER_ROLE_COMMERCIAL_CONTRACT_HOLD");
 const claim=await claimOwnerOpeningWelcome({...callbacks,pool,requestId,admin,sourceAdmin,requireUsScope:true,
   prepareSourceReceipt:()=>prepareManualG3RequestReceipt(pool,requestId,{raw,purpose:"welcome",admin:sourceAdmin}),
   preparePaidEvidence:prepareUsPaidActivationEvidence});
 if(claim.kind==="already_sent")return {request:claim.request,message_id:claim.messageId,gmail_message_id:claim.gmailMessageId,idempotent:true};
 const args={pool,requestId,messageId:claim.messageId,admin,sourceAdmin,createTrace:callbacks.createTrace,writeAudit:callbacks.writeAudit,requireUsScope:true};
 let gmailMessageId=null;
 try{
   const accepted=await sendEmail(claim.preview,claim.rfcMessageId);
   gmailMessageId=accepted?.data?.id||null;
   if(!gmailMessageId)throw fail("GMAIL_ACKNOWLEDGEMENT_MISSING",503);
   const done=await finalizeOwnerOpeningWelcomeSent({...args,gmailMessageId});
   return {request:done.request,message_id:claim.messageId,gmail_message_id:gmailMessageId,audit_event_id:done.audit_event_id||null};
 }catch(_error){
   try{await markOwnerOpeningWelcomeUncertain({...args,gmailMessageId});}catch(_ignored){}
   throw Object.assign(fail("OWNER_OPENING_GMAIL_DELIVERY_UNCERTAIN",503),{message_id:claim.messageId,requires_reconciliation:true});
 }
}

// Recovery only: no Gmail send, no source receipt reuse, no new paid grant.
export async function reconcileUsAdminWelcome({pool,requestId,sourceAdmin,admin,gmailMessageId,verifyGmailSent,callbacks}={}){
 assertUsCommercialWriterReleased("welcome");
 if(sourceAdmin?.role!=="admin"||!sourceAdmin.session_id||!Number.isSafeInteger(Number(sourceAdmin.user_id))||Number(sourceAdmin.user_id)<=0)
   throw fail("US_G3_ADMIN_SESSION_REQUIRED",403);
 return reconcileOwnerOpeningWelcomeSent({pool,requestId,sourceAdmin,admin,gmailMessageId,verifyGmailSent,
   createTrace:callbacks.createTrace,writeAudit:callbacks.writeAudit,requireUsScope:true});
}
