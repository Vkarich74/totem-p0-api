// routes_public/bookingResult.js — PUBLIC READ-ONLY RESULT
// Contract:
// GET /public/bookings/:id/result
// - Auth: publicToken
// - Read-only
// - Source of truth: bookings.status
// - final = true ONLY if booking.status IN ('paid','expired','cancelled')

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

router.get("/:id/result", async (req, res) => {
  const bookingId = Number(req.params.id);

  if (!bookingId) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_BOOKING_ID",
    });
  }

  const client = await pool.connect();

  try {
    // 1️⃣ load booking
    const { rows: bookingRows, rowCount } = await client.query(
      `
      SELECT id, status
      FROM bookings
      WHERE id = $1
      `,
      [bookingId]
    );

    if (rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: "BOOKING_NOT_FOUND",
      });
    }

    const booking = bookingRows[0];

    // 2️⃣ load active payment (if any)
    const { rows: paymentRows } = await client.query(
      `
      SELECT status
      FROM payments
      WHERE booking_id = $1
        AND is_active = true
      ORDER BY id DESC
      LIMIT 1
      `,
      [bookingId]
    );

    const paymentStatus = paymentRows[0]?.status ?? null;

    // 3️⃣ final logic (canonical)
    const final =
      booking.status === "paid" ||
      booking.status === "expired" ||
      booking.status === "cancelled";

    return res.json({
      ok: true,
      booking_id: booking.id,
      booking_status: booking.status,
      payment_status: paymentStatus,
      final,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  } finally {
    client.release();
  }
});

export default router;
