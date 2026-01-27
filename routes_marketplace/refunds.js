// routes_marketplace/refunds.js (ESM)
// API for refunds / chargebacks (system or payment-provider)
// STEP 23.3: idempotency enabled

import { createRefund } from "../core/refunds.js";
import { idempotencyGuard } from "../middleware/idempotency.js";

function assertSystemOrProvider(req) {
  const actorType = req.headers["x-actor-type"];
  if (!["system", "provider"].includes(actorType)) {
    const e = new Error("Forbidden");
    e.code = "FORBIDDEN_REFUND";
    throw e;
  }
}

export function registerRefundRoutes(app, db) {

  /**
   * CREATE REFUND / CHARGEBACK
   * POST /marketplace/refunds
   * Headers:
   *   x-actor-type: system | provider
   *   Idempotency-Key: required
   * Body:
   * {
   *   bookingId: 999,
   *   amount: 100,
   *   currency: "USD",
   *   type: "refund" | "chargeback",
   *   reason: "optional text"
   * }
   */
  app.post(
    "/marketplace/refunds",
    // 🔐 idempotency обязателен — провайдеры часто ретраят
    idempotencyGuard("refunds:create", {
      ttlSeconds: 60 * 60 * 24 // 24 часа
    }),
    (req, res) => {
      try {
        assertSystemOrProvider(req);

        const { bookingId, amount, currency, type, reason } = req.body || {};

        const result = createRefund(db, {
          bookingId,
          amount,
          currency,
          type,
          reason
        });

        res.json({ ok: true, result });

      } catch (err) {
        handleRefundError(err, res);
      }
    }
  );
}

function handleRefundError(err, res) {
  const code = err.code || "REFUND_ERROR";

  switch (code) {
    case "REFUND_FIELDS_REQUIRED":
    case "INVALID_REFUND_TYPE":
      return res.status(400).json({ error: code });

    case "PAYMENT_NOT_FOUND":
      return res.status(404).json({ error: code });

    case "PAYMENT_NOT_REFUNDABLE":
      return res.status(409).json({ error: code });

    case "FORBIDDEN_REFUND":
      return res.status(403).json({ error: code });

    default:
      console.error("[REFUND_ERROR]", err);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
