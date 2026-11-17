// TEST ONLY. Must be mounted BEFORE express.json() with express.raw().
// Disabled by default in src/app.js. No payment creation or disbursement.
import { acceptSignedStripeTestWebhook } from "../services/usStripeTestWebhook.service.js";

export function buildUsStripeTestWebhookHandler({
  pool, webhookSecret, enabled = false,
} = {}) {
  if (!pool || typeof pool.connect !== "function") {
    throw new Error("US_STRIPE_TEST_WEBHOOK_POOL_REQUIRED");
  }

  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!enabled || !webhookSecret) {
      return res.status(404).json({ ok: false, error: "US_STRIPE_TEST_WEBHOOK_DISABLED" });
    }
    if (!Buffer.isBuffer(req.body)) {
      return res.status(415).json({ ok: false, error: "US_STRIPE_RAW_BODY_REQUIRED" });
    }
    try {
      const response = await acceptSignedStripeTestWebhook({
        pool, rawBody: req.body,
        stripeSignature: req.get("Stripe-Signature"),
        webhookSecret,
      });
      return res.status(response.status).json(response.body);
    } catch (error) {
      console.error("US_STRIPE_TEST_WEBHOOK_PROCESSING_FAILED", String(error?.code || "UNKNOWN"));
      return res.status(503).json({ ok: false, error: "US_STRIPE_TEST_WEBHOOK_UNAVAILABLE" });
    }
  };
}
