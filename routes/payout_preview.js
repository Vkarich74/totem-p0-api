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

    // 1. payment must be succeeded
    const paymentResult = await db.query(
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

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ error: "payment_not_succeeded" });
    }

    const payment = paymentResult.rows[0];

    // 2. payout must not exist
    const payoutResult = await db.query(
      `
      SELECT id
      FROM payouts
      WHERE booking_id = $1
      LIMIT 1
      `,
      [booking_id]
    );

    if (payoutResult.rows.length > 0) {
      return res.status(409).json({ error: "already_paid" });
    }

    // 3. preview OK
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
