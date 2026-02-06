// routes_public/paymentsRead.js
import express from "express";
import db from "../db.js";

const router = express.Router();

/**
 * GET /public/payments?booking_id=1
 * Read-only payments by booking
 */
router.get("/", async (req, res) => {
  try {
    const bookingId = Number(req.query.booking_id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ error: "INVALID_INPUT" });
    }

    const payments = await db.all(
      `SELECT
         payment_id,
         booking_id,
         amount_total,
         amount_base,
         amount_tips,
         currency,
         status,
         provider,
         created_at
       FROM payments
       WHERE booking_id = $1
       ORDER BY created_at ASC`,
      [bookingId]
    );

    if (!payments || payments.length === 0) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    return res.json({
      ok: true,
      payments
    });
  } catch (err) {
    console.error("[PAYMENTS_READ_ERROR]", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
