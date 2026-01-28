import express from "express";
import db from "../db/index.js";

const router = express.Router();

router.post("/payouts/preview", (req, res) => {
  try {
    const { booking_id } = req.body;

    if (typeof booking_id !== "number") {
      return res.status(400).json({ error: "invalid_booking_id" });
    }

    let payment;
    try {
      payment = db.prepare(`
        SELECT *
        FROM payments
        WHERE booking_id = ?
          AND status = 'succeeded'
        ORDER BY id DESC
        LIMIT 1
      `).get(booking_id);
    } catch (e) {
      console.error("SQL_ERROR_PAYMENTS", e);
      return res.status(500).json({
        error: "sql_error_payments",
        message: e.message
      });
    }

    if (!payment) {
      return res.status(404).json({ error: "payment_not_succeeded" });
    }

    let payout;
    try {
      payout = db.prepare(`
        SELECT id
        FROM payouts
        WHERE booking_id = ?
        LIMIT 1
      `).get(booking_id);
    } catch (e) {
      console.error("SQL_ERROR_PAYOUTS", e);
      return res.status(500).json({
        error: "sql_error_payouts",
        message: e.message
      });
    }

    if (payout) {
      return res.status(409).json({ error: "already_paid" });
    }

    return res.json({
      ok: true,
      booking_id,
      payment_row: payment
    });

  } catch (err) {
    console.error("PAYOUT_PREVIEW_FATAL", err);
    return res.status(500).json({
      error: "fatal",
      message: err.message,
      stack: err.stack
    });
  }
});

export default router;
