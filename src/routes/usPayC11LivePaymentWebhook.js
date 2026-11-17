// US-PAY-C11 LIVE direct-charge payment webhooks.
// Dedicated connected-account Stripe signature, raw bytes before express.json.
// A signed event is NEVER enough if it fails account/amount/booking anchoring.
// Does not enable a customer charge: it only reconciles Stripe-origin events.
import { acceptSignedUsC11LivePaymentEvent } from
  "../services/usPayC11LivePaymentWebhook.service.js";

export function buildUsC11LivePaymentWebhook({
  pool,
  enabled=process.env.US_PAY_C11_LIVE_PAYMENT_WEBHOOK_ENABLED==="true",
  webhookSecret=process.env.US_PAY_C11_LIVE_PAYMENT_WEBHOOK_SECRET||"",
}={}) {
  if(!pool||typeof pool.connect!=="function") {
    throw new Error("US_C11_LIVE_PAYMENT_DB_REQUIRED");
  }
  return async(req,res)=>{
    res.set("Cache-Control","no-store");
    res.set("Referrer-Policy","no-referrer");
    if(!enabled||!webhookSecret) {
      return res.status(404).json({
        ok:false,error:"US_C11_LIVE_PAYMENT_WEBHOOK_DISABLED",
      });
    }
    if(!Buffer.isBuffer(req.body)) {
      return res.status(415).json({
        ok:false,error:"US_C11_LIVE_RAW_PAYMENT_BODY_REQUIRED",
      });
    }
    try {
      const result=await acceptSignedUsC11LivePaymentEvent({
        pool,rawBody:req.body,
        stripeSignature:req.get("Stripe-Signature"),
        webhookSecret,
      });
      return res.status(result.status).json(result.body);
    }catch(error){
      // No Stripe event bodies, PII, secrets, URLs or client tokens in logs.
      console.error("US_C11_LIVE_PAYMENT_WEBHOOK_FAILED",
        String(error?.code||"INTERNAL"));
      return res.status(503).json({
        ok:false,error:"US_C11_LIVE_PAYMENT_WEBHOOK_UNAVAILABLE",
      });
    }
  };
}
