import express from "express";
import db from "../db/index.js";

const router = express.Router();

/**
 * POST /payouts/preview
 * Input: { booking_id }
 */
router.post("/payouts/preview", async (req, res) => {
  try {
    const { booking_id } = req.body;

    if (!booking_id || typeof booking_id !== "number") {
      return res.status(400).json({ error: "invalid_booking_id" });
    }

    // payment must be succeeded
    const payment = await db.oneOrNone(
      `
      SELECT id, amount_total
      FROM payments
      WHERE booking_id = $1
        AND status = 'succeeded'
      ORDER BY id DESC
      LIMIT 1
      `,
      [booking_id]
    );

    if (!payment) {
      return res.status(404).json({ error: "payment_not_succeeded" });
    }

    // payout must not exist
    const payout = await db.oneOrNone(
      `
      SELECT id
      FROM payouts
      WHERE booking_id = $1
      LIMIT 1
      `,
      [booking_id]
    );

    if (payout) {
      return res.status(409).json({ error: "already_paid" });
    }

    return res.json({
      ok: true,
      booking_id,
      amount: payment.amount_total
    });
  } catch (err) {
    console.error("PAYOUT_PREVIEW_ERROR", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
