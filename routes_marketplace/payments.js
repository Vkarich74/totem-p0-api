// routes_marketplace/payments.js
import { createPayment } from "../core/payments.js";
import { idempotencyGuard } from "../middleware/idempotency.js";

export function registerPaymentRoutes(app, db) {
  app.post(
    "/marketplace/payment",
    // scope: payments:create
    // idem-key обязателен для безопасных повторов
    idempotencyGuard("payments:create", {
      ttlSeconds: 60 * 60 * 24 // 24 часа
    }),
    (req, res) => {
      try {
        const { bookingId, amount, provider, providerRef } = req.body;

        if (!bookingId || !amount || !provider) {
          return res.status(400).json({
            ok: false,
            error: "bookingId, amount, provider required",
          });
        }

        const payment = createPayment(
          db,
          Number(bookingId),
          Number(amount),
          provider,
          providerRef
        );

        return res.json({ ok: true, payment });
      } catch (err) {
        if (err && err.code === "PAYMENT_ALREADY_EXISTS") {
          return res.status(409).json({ ok: false, error: err.code });
        }

        console.error(err);
        return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
      }
    }
  );

  console.log("payment routes loaded (STEP 23.1 idempotency)");
}
