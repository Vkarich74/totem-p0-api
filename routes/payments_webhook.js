/**
 * Payments Webhook (MOCK)
 *
 * POST /payments/webhook
 *
 * Body:
 * {
 *   "payment_id": "pay_xxx",
 *   "event": "payment_succeeded" | "payment_failed"
 * }
 */

import express from "express";
import { applyWebhookEvent } from "../services/payment_provider_mock.js";

const router = express.Router();

router.post("/webhook", (req, res) => {
  const { payment_id, event } = req.body || {};

  const result = applyWebhookEvent({ payment_id, event });

  if (!result.ok) {
    return res.status(400).json(result);
  }

  return res.json({
    ok: true,
    payment: result.payment
  });
});

export default router;
