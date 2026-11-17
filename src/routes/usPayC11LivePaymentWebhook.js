/**
 * TOTEM USA C11: ONE Stripe Connect LIVE financial event endpoint.
 * RAW body must be mounted before express.json(); every handler verifies
 * the original signed bytes with the same registered Stripe whsec.
 *
 * PaymentIntent reconciliation may upgrade payment state to paid.
 * Refunds, disputes and payouts are REST-verified financial observations,
 * no refund/payout/transfer initiated by webhook or browser.
 * Both routes separately OFF by default; neither runs if secrets missing.
 */
import {acceptSignedUsC11LivePaymentEvent} from
  "../services/usPayC11LivePaymentWebhook.service.js";
import {acceptUsC11SignedLiveFinancialEvent} from
  "../services/usPayC11LiveFinancialEvents.service.js";

const EVENT_PREFIX=/^(?:refund\.|charge\.dispute\.|payout\.)/;
export function buildUsC11LivePaymentWebhook({
  pool,
  enabled=process.env.US_PAY_C11_LIVE_PAYMENT_WEBHOOK_ENABLED==="true",
  financeEnabled=process.env.US_PAY_C11_LIVE_FINANCE_EVENTS_ENABLED==="true",
  webhookSecret=process.env.US_PAY_C11_LIVE_PAYMENT_WEBHOOK_SECRET||"",
  secretKey=process.env.US_PAY_C11_LIVE_STRIPE_SECRET_KEY||"",
  fetchImpl=globalThis.fetch,
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

    let financial=false;
    try {
      // Routing inspection ONLY. Untrusted JSON is NOT applied; downstream
      // individual service verifies raw HMAC before touching finance tables.
      if(req.body.length>131072||req.body.length<2){
        return res.status(413).json({ok:false,error:"US_C11_LIVE_EVENT_TOO_LARGE"});
      }
      financial=EVENT_PREFIX.test(
        String(JSON.parse(req.body.toString("utf8"))?.type||"")
      );
    }catch{
      return res.status(400).json({ok:false,error:"US_C11_LIVE_EVENT_INVALID_JSON"});
    }

    if(financial&&!financeEnabled){
      return res.status(503).json({
        ok:false,error:"US_C11_LIVE_FINANCIAL_OBSERVATION_DISABLED",
      });
    }
    try {
      const args={
        pool,rawBody:req.body,
        stripeSignature:req.get("Stripe-Signature"),
        webhookSecret,
      };
      const result=financial ?
        await acceptUsC11SignedLiveFinancialEvent({
          ...args,secretKey,fetchImpl,
        }):
        await acceptSignedUsC11LivePaymentEvent(args);
      return res.status(result.status).json(result.body);
    }catch(error){
      // Never log Stripe response, webhook payload, keys or customer data.
      console.error("US_C11_LIVE_STRIPE_WEBHOOK_FAILED",
        String(error?.code||"INTERNAL"));
      return res.status(503).json({
        ok:false,error:"US_C11_LIVE_WEBHOOK_UNAVAILABLE",
      });
    }
  };
}
