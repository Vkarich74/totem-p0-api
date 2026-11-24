import express from "express";
import {requireAuth} from "../middleware/requireAuth.js";
import {decideUsExistingSalonConsent,usMasterConsentEnabled} from "../services/provision/usMasterRoleAuthority.js";
// Default OFF; explicit owner action, never an alternative registration route.
// No cookie-only authorization and no client-selected salon/owner identity.
export function buildUsMasterConsentRouter(pool){
 const r=express.Router();
 const handler=decision=>async(req,res)=>{
  res.set("Cache-Control","no-store");
  if(!usMasterConsentEnabled())return res.status(409).json({ok:false,error:"US_MASTER_CONSENT_HOLD"});
  if(!/^Bearer\s+\S+$/i.test(String(req.headers.authorization||""))||
     req.auth?.source!=="session"||req.auth.role!=="salon_admin")
    return res.status(403).json({ok:false,error:"US_MASTER_DIRECT_OWNER_REQUIRED"});
  if(decision==="grant"&&(!req.body||Object.keys(req.body).length!==1||
      typeof req.body.revision!=="string"||!/^[a-f0-9]{64}$/.test(req.body.revision))||
     decision!=="grant"&&Object.keys(req.body??{}).length)
    return res.status(400).json({ok:false,error:"US_MASTER_CONSENT_BODY_INVALID"});
  try{
   const result=await decideUsExistingSalonConsent({pool,requestId:req.params.requestId,auth:req.auth,decision,expectedFingerprint:req.body?.revision});
   return res.json({ok:true,...result});
  }catch(e){
   if(["US_MASTER_REQUEST_NOT_FOUND","US_MASTER_SOURCE_AUTHORITY_REQUIRED","US_MASTER_TARGET_CHANGED",
     "US_MASTER_TARGET_OWNER_NOT_VERIFIED","US_MASTER_TARGET_SOURCE_REVIEW_REQUIRED","US_MASTER_DIRECT_OWNER_REQUIRED",
     "US_MASTER_OWNER_SESSION_INVALID","US_MASTER_CONSENT_REQUEST_NOT_PENDING"].includes(e?.code))
     return res.status(404).json({ok:false,error:"US_MASTER_CONSENT_REQUEST_UNAVAILABLE"});
   const code=typeof e?.code==="string"&&/^US_MASTER_[A-Z0-9_]+$/.test(e.code)?e.code:"US_MASTER_CONSENT_UNAVAILABLE";
   // Do not expose existence of another owner's application.
   const status=[400,403,409].includes(e?.status)?e.status:503;
   return res.status(status).json({ok:false,error:code});
  }
 };
 r.get("/us-master-consent/:requestId",requireAuth,handler("read"));
 r.put("/us-master-consent/:requestId",requireAuth,handler("grant"));
 r.delete("/us-master-consent/:requestId",requireAuth,handler("revoke"));
 return r;
}
