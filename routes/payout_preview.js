/**
 * Payout Preview HTTP Route (ESM)
 *
 * POST /payouts/preview
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
import { getPayoutPreview } from "../services/payout_preview.js";

const router = express.Router();

router.post("/preview", (req, res) => {
  const { booking_id, service_price, marketplace, payment_id } = req.body || {};

  const result = getPayoutPreview({
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
