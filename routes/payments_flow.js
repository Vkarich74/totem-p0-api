/**
 * Payments Flow HTTP Route (DRY-RUN)
 *
 * POST /payments/flow
 *
 * Body:
 * {
 *   "booking_id": 1,
 *   "service_price": 1000,
 *   "marketplace": { "enabled": true },
 *   "simulate": "success" // or "fail"
 * }
 *
 * No DB writes.
 * No real payments.
 */

import express from "express";
import { runPaymentFlow } from "../services/payment_flow.js";

const router = express.Router();

router.post("/flow", (req, res) => {
  const {
    booking_id,
    service_price,
    marketplace,
    simulate
  } = req.body || {};

  const result = runPaymentFlow({
    booking_id,
    service_price,
    marketplace,
    simulate
  });

  if (!result.ok) {
    return res.status(400).json(result);
  }

  return res.json(result);
});

export default router;
