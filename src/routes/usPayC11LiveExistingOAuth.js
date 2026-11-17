// Public Stripe OAuth redirect landing; authorization comes from one-time,
// server-held, authenticated-owner session state, NEVER from query owner IDs.
// This callback has NO access to credit cards and NEVER initiates payments.
import { finishExistingUsStripeOAuth,
  US_CONNECT_LIVE_OAUTH_CALLBACK } from
  "../services/usPayC11LiveExistingOAuth.service.js";

export function buildUsPayC11LiveExistingOAuthCallback({
  pool,
  enabled=process.env.US_PAY_C11_LIVE_CONNECT_ENABLED==="true" &&
    process.env.US_PAY_C11_LIVE_OAUTH_ENABLED==="true",
  secretKey=process.env.US_PAY_C11_LIVE_STRIPE_SECRET_KEY||"",
  clientId=process.env.US_PAY_C11_LIVE_OAUTH_CLIENT_ID||"",
  fetchImpl,
}={}) {
  if(!pool || typeof pool.connect!=="function") {
    throw new Error("US_CONNECT_OAUTH_DB_POOL_REQUIRED");
  }
  return async(req,res)=>{
    res.set("Cache-Control","no-store, private");
    res.set("Referrer-Policy","no-referrer");
    res.set("X-Content-Type-Options","nosniff");
    if(!enabled) {
      return res.status(404).send("Not found");
    }
    if(typeof req.query?.state!=="string" ||
       (typeof req.query?.code!=="string" &&
        req.query?.error!=="access_denied")) {
      return res.redirect(303,"https://app.totemv.com/");
    }
    try {
      const answer=await finishExistingUsStripeOAuth(pool,{
        state:req.query.state,
        code:typeof req.query.code==="string" ? req.query.code : undefined,
        error:typeof req.query.error==="string" ? req.query.error : undefined,
        secretKey,clientId,
        redirectUri:US_CONNECT_LIVE_OAUTH_CALLBACK,
        fetchImpl,
      });
      // Never put code, state or account ID into final Location or logs.
      return res.redirect(303,answer.redirectTo);
    } catch(e) {
      console.error("US_CONNECT_OAUTH_CALLBACK_FAILED",String(e?.code||"INTERNAL"));
      return res.redirect(303,"https://app.totemv.com/");
    }
  };
}
