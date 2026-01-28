import express from "express";
import db from "../db/index.js";

const router = express.Router();

/**
 * POST /payouts/preview
 * Input: { booking_id }
 */
router.post("/payouts/preview", (req, res) => {
  try {
    const { booking_id } = req.body;

    if (typeof booking_id !== "number") {
      return res.status(400).json({ error: "invalid_booking_id" });
    }

    // 1. payment must be succeeded
    const payment = db
      .prepare(`
        SELECT id, amount_total
        FROM payments
        WHERE booking_id = ?
          AND status = 'succeeded'
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(booking_id);

    if (!payment) {
      return res.status(404).json({ error: "payment_not_succeeded" });
    }

    // 2. payout must not exist
    const payout = db
      .prepare(`
        SELECT id
        FROM payouts
        WHERE booking_id = ?
        LIMIT 1
      `)
      .get(booking_id);

    if (payout) {
      return res.status(409).json({ error: "already_paid" });
    }

    // 3. preview OK
    return res.json({
      ok: true,
      booking_id,
      amount: payment.amount_total
    });
  } catch (err) {
    console.error("PAYOUT_PREVIEW_FATAL", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
