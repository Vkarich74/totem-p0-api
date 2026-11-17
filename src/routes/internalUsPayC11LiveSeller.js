// Stripe LIVE Connect owner/master self-onboarding; NO payment execution.
// Mounted only after resolveAuth + requireAuth on the internal route.
// Feature is OFF until explicitly configured in a reviewed deployment.
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  beginExistingUsStripeOAuth,
  US_CONNECT_LIVE_OAUTH_CALLBACK,
} from "../services/usPayC11LiveExistingOAuth.service.js";
import {
  getLiveSellerConnection,
  startLiveSellerOnboarding,
  refreshLiveSellerVerification,
} from "../services/usPayC11LiveSellerOnboarding.service.js";

export function buildUsPayC11LiveSellerRouter(pool,{
  enabled = process.env.US_PAY_C11_LIVE_CONNECT_ENABLED === "true",
  secretKey = process.env.US_PAY_C11_LIVE_STRIPE_SECRET_KEY || "",
  oauthEnabled = process.env.US_PAY_C11_LIVE_OAUTH_ENABLED === "true",
  oauthClientId = process.env.US_PAY_C11_LIVE_OAUTH_CLIENT_ID || "",
  fetchImpl,
}={}) {
  if(!pool || typeof pool.connect!=="function") {
    throw new Error("US_CONNECT_DB_POOL_REQUIRED");
  }
  const router=express.Router();
  router.use(requireAuth);
  router.use((req,res,next)=>{
    res.set("Cache-Control","no-store");
    res.set("Referrer-Policy","no-referrer");
    if (!enabled) {
      return res.status(404).json({ok:false,error:"US_CONNECT_NOT_ENABLED"});
    }
    return next();
  });

  router.get("/us-pay-c11/live-connect/:ownerType/:ownerId",async(req,res)=>{
    try{
      const result=await getLiveSellerConnection(pool,{
        auth:req.auth,ownerType:req.params.ownerType,ownerId:req.params.ownerId,
      });
      return res.status(result.status).json(result.body);
    }catch(error){
      console.error("US_CONNECT_STATUS_FAILED",String(error?.code||"INTERNAL"));
      return res.status(503).json({ok:false,error:"US_CONNECT_SERVICE_UNAVAILABLE"});
    }
  });

  router.post("/us-pay-c11/live-connect/:ownerType/:ownerId/start",async(req,res)=>{
    const body=req.body;
    if(!body || typeof body!=="object" || Array.isArray(body) ||
       Object.keys(body).length!==1 || body.consent!==true) {
      return res.status(400).json({ok:false,error:"US_CONNECT_EXPLICIT_CONSENT_REQUIRED"});
    }
    try{
      const result=await startLiveSellerOnboarding(pool,{
        auth:req.auth,ownerType:req.params.ownerType,ownerId:req.params.ownerId,
        consent:true,secretKey,fetchImpl,
      });
      return res.status(result.status).json(result.body);
    }catch(error){
      console.error("US_CONNECT_START_FAILED",String(error?.code||error?.message||"INTERNAL")
        .replace(/sk_live_[a-zA-Z0-9_]+/g,"[redacted]"));
      return res.status(503).json({ok:false,error:"US_CONNECT_SERVICE_UNAVAILABLE"});
    }
  });

  router.post("/us-pay-c11/live-connect/:ownerType/:ownerId/refresh",async(req,res)=>{
    if(req.body && Object.keys(req.body).length) {
      return res.status(400).json({ok:false,error:"US_CONNECT_REFRESH_BODY_FORBIDDEN"});
    }
    try{
      const result=await refreshLiveSellerVerification(pool,{
        auth:req.auth,ownerType:req.params.ownerType,ownerId:req.params.ownerId,
        secretKey,fetchImpl,
      });
      return res.status(result.status).json(result.body);
    }catch(error){
      console.error("US_CONNECT_REFRESH_FAILED",String(error?.code||"INTERNAL"));
      return res.status(503).json({ok:false,error:"US_CONNECT_SERVICE_UNAVAILABLE"});
    }
  });
  // Connect a seller's EXISTING Stripe Standard account. Requires explicit
  // owner action and Stripe OAuth (never accepts a browser-provided acct_*).
  router.post("/us-pay-c11/live-connect/:ownerType/:ownerId/oauth/start",
    async(req,res)=>{
      if(!oauthEnabled) {
        return res.status(404).json({ok:false,error:"US_CONNECT_OAUTH_NOT_ENABLED"});
      }
      const body=req.body;
      if(!body || typeof body!=="object" || Array.isArray(body) ||
         Object.keys(body).length!==1 || body.consent!==true) {
        return res.status(400).json({
          ok:false,error:"US_CONNECT_EXPLICIT_CONSENT_REQUIRED",
        });
      }
      try {
        const result=await beginExistingUsStripeOAuth(pool,{
          auth:req.auth,ownerType:req.params.ownerType,ownerId:req.params.ownerId,
          consent:true,secretKey,clientId:oauthClientId,
          redirectUri:US_CONNECT_LIVE_OAUTH_CALLBACK,fetchImpl,
        });
        return res.status(result.status).json(result.body);
      } catch(error) {
        console.error("US_CONNECT_OAUTH_START_FAILED",String(error?.code||"INTERNAL"));
        return res.status(503).json({
          ok:false,error:"US_CONNECT_OAUTH_SERVICE_UNAVAILABLE",
        });
      }
    }
  );

  return router;
}
