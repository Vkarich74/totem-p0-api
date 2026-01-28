/**
 * Payout Execution HTTP Route (ESM)
 *
 * POST /payouts/create
 *
 * Body:
 * {
 *   "booking_id": 1,
 *   "service_price": 1000,
 *   "marketplace": { "enabled": true },
 *   "payment_id": "pay_xxx"
 * }
 */

import express from "express";
import { executePayout } from "../services/payout_execution.js";

const router = express.Router();

router.post("/create", (req, res) => {
  const { booking_id, service_price, marketplace, payment_id } = req.body || {};

  const result = executePayout({
    booking_id,
    service_price,
    marketplace,
    payment_id
  });

  if (!result.ok) {
    return res.status(400).json(result);
  }

  return res.json(result);
});

export default router;
