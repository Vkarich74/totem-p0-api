// routes_system/bookingTimeout.js — CANONICAL TIMEOUT
// Closes unpaid bookings and fails pending payments

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

/**
 * POST /system/bookings/timeout
 * Auth: systemAuth
 * Params:
 * - minutes (optional, default 15)
 */
router.post("/timeout", async (req, res) => {
  const minutes = Number(req.body?.minutes) || 15;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ expire bookings
    const { rowCount: expiredBookings } = await client.query(
      `
      UPDATE bookings
      SET status = 'expired'
      WHERE status = 'pending_payment'
        AND created_at < now() - ($1 || ' minutes')::interval
      `,
      [minutes]
    );

    // 2️⃣ fail pending payments linked to expired bookings
    const { rowCount: failedPayments } = await client.query(
      `
      UPDATE payments
      SET status = 'failed',
          is_active = false,
          updated_at = now()
      WHERE status = 'pending'
        AND booking_id IN (
          SELECT id FROM bookings WHERE status = 'expired'
        )
      `
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      expired_bookings: expiredBookings,
      failed_payments: failedPayments,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({
      ok: false,
      error: "TIMEOUT_FAILED",
    });
  } finally {
    client.release();
  }
});

export default router;
