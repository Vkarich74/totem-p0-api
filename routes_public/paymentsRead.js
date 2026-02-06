// routes_public/paymentsRead.js
import express from "express";
import db from "../db.js";

const router = express.Router();

/**
 * GET /public/payments?booking_id=123
 * Read-only. No side effects.
 */
router.get("/", (req, res) => {
  try {
    const bookingId = Number(req.query.booking_id);

    if (!Number.isInteger(bookingId)) {
      return res.status(400).json({ error: "INVALID_BOOKING_ID" });
    }

    const payments = db.all(
      `
      SELECT
        id,
        booking_id,
        provider,
        status,
        amount,
        currency,
        created_at
      FROM payments
      WHERE booking_id = ?
      ORDER BY created_at ASC
      `,
      [bookingId]
    );

    return res.json({
      ok: true,
      booking_id: bookingId,
      payments
    });
  } catch (err) {
    console.error("[PAYMENTS_READ_ERROR]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
