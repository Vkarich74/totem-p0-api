import express from "express";
import db from "../db/index.js";

const router = express.Router();

router.post("/payouts/preview", async (req, res) => {
  try {
    const { booking_id } = req.body;
    if (typeof booking_id !== "number") {
      return res.status(400).json({ error: "invalid_booking_id" });
    }

    if (db.mode === "postgres") {
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

      if (!payment) return res.status(404).json({ error: "payment_not_succeeded" });

      const payout = await db.oneOrNone(
        `SELECT id FROM payouts WHERE booking_id = $1 LIMIT 1`,
        [booking_id]
      );

      if (payout) return res.status(409).json({ error: "already_paid" });

      return res.json({ ok: true, booking_id, amount: payment.amount_total });
    }

    // sqlite (local only)
    const payment = db
      .prepare(
        `
        SELECT id, amount_total
        FROM payments
        WHERE booking_id = ?
          AND status = 'succeeded'
        ORDER BY id DESC
        LIMIT 1
        `
      )
      .get(booking_id);

    if (!payment) return res.status(404).json({ error: "payment_not_succeeded" });

    const payout = db
      .prepare(`SELECT id FROM payouts WHERE booking_id = ? LIMIT 1`)
      .get(booking_id);

    if (payout) return res.status(409).json({ error: "already_paid" });

    return res.json({ ok: true, booking_id, amount: payment.amount_total });
  } catch (e) {
    console.error("PAYOUT_PREVIEW_FATAL", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
