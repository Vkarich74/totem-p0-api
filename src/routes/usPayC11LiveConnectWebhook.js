// US-PAY-C11 LIVE Connect merchant-account event receiver, NOT a payment webhook.
// Default CLOSED until a production-approved merchant connection deployment.
// Raw bytes must arrive before express.json() so HMAC verification is real.
import { acceptSignedUsLiveConnectWebhook } from
  "../services/usPayC11LiveConnectWebhook.service.js";

export function buildUsPayC11LiveConnectWebhook({
  pool,
  enabled = process.env.US_PAY_C11_LIVE_CONNECT_WEBHOOK_ENABLED === "true",
  webhookSecret = process.env.US_PAY_C11_LIVE_CONNECT_WEBHOOK_SECRET || "",
  liveSecretKey = process.env.US_PAY_C11_LIVE_STRIPE_SECRET_KEY || "",
  fetchImpl,
}={}) {
  if (!pool || typeof pool.connect !== "function") {
    throw new Error("US_C11_CONNECT_WEBHOOK_POOL_REQUIRED");
  }
  return async (req,res)=>{
    res.set("Cache-Control","no-store");
    res.set("Referrer-Policy","no-referrer");
    if (!enabled || !webhookSecret || !liveSecretKey) {
      return res.status(404).json({
        ok:false,error:"US_C11_LIVE_CONNECT_WEBHOOK_DISABLED",
      });
    }
    if (!Buffer.isBuffer(req.body)) {
      return res.status(415).json({ok:false,error:"US_C11_RAW_BODY_REQUIRED"});
    }
    try {
      const reply=await acceptSignedUsLiveConnectWebhook({
        pool,rawBody:req.body,
        stripeSignature:req.get("Stripe-Signature"),
        webhookSecret,liveSecretKey,fetchImpl,
      });
      return res.status(reply.status).json(reply.body);
    } catch (error) {
      // Do not log sensitive event data, Stripe account details or secrets.
      console.error("US_C11_LIVE_CONNECT_WEBHOOK_FAILED",
        String(error?.code||"INTERNAL"));
      return res.status(503).json({ok:false,error:"US_C11_CONNECT_EVENT_UNAVAILABLE"});
    }
  };
}
