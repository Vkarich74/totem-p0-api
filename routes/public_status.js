// routes/public_status.js
// Public booking & payment status (Postgres)
// NO AUTH — read-only

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

function validationError(res, message) {
  return res.status(400).json({ ok: false, error: message });
}

// --------------------
// GET /public/status/booking
// --------------------
router.get("/booking", async (req, res) => {
  const { booking_id } = req.query;
  if (!booking_id) return validationError(res, "booking_id_required");

  try {
    const { rows } = await pool.query(
      `
      SELECT
        b.id AS booking_id,
        b.status,
        b.date,
        b.start_time,
        b.end_time,
        b.source,
        b.created_at,
        b.salon_slug,
        b.master_slug,
        b.service_id
      FROM bookings b
      WHERE b.id = $1
      `,
      [booking_id]
    );

    if (!rows.length) {
      return validationError(res, "booking_not_found");
    }

    return res.json({ ok: true, booking: rows[0] });
  } catch (e) {
    console.error("[PUBLIC STATUS BOOKING]", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// --------------------
// GET /public/status/payment
// --------------------
router.get("/payment", async (req, res) => {
  const { payment_id } = req.query;
  if (!payment_id) return validationError(res, "payment_id_required");

  try {
    const { rows } = await pool.query(
      `
      SELECT
        id AS payment_id,
        booking_id,
        amount,
        currency,
        provider,
        status,
        created_at
      FROM payments
      WHERE id = $1
      `,
      [payment_id]
    );

    if (!rows.length) {
      return validationError(res, "payment_not_found");
    }

    return res.json({ ok: true, payment: rows[0] });
  } catch (e) {
    console.error("[PUBLIC STATUS PAYMENT]", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

export default router;
