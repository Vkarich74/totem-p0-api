// routes_system/paymentsWebhook.js — PROD + BOOKING LIFECYCLE v2 (TRANSACTION FIX)

import express from "express";
import { pool } from "../db/index.js";
import updateBookingStatus from "../helpers/updateBookingStatus.js";
import { BOOKING_STATUSES } from "../core/bookingStatus.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { payment_id, status } = req.body;

  if (!payment_id || status !== "succeeded") {
    return res.status(400).json({ ok: false, error: "INVALID_PAYLOAD" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows, rowCount } = await client.query(
      `
      SELECT id, booking_id, status
      FROM payments
      WHERE id = $1
      FOR UPDATE
      `,
      [payment_id]
    );

    if (rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "PAYMENT_NOT_FOUND" });
    }

    const payment = rows[0];

    if (payment.status !== "confirmed") {
      await client.query(
        `
        UPDATE payments
        SET status = 'confirmed',
            updated_at = now()
        WHERE id = $1
        `,
        [payment_id]
      );
    }

    // 🔥 SAME CLIENT, SAME TRANSACTION
    await updateBookingStatus(
      client,
      payment.booking_id,
      BOOKING_STATUSES.PAID,
      { type: "system" }
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      payment_id,
      booking_id: payment.booking_id,
      booking_status: BOOKING_STATUSES.PAID,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("PAYMENT WEBHOOK ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.code || "INTERNAL_ERROR",
    });
  } finally {
    client.release();
  }
});

export default router;
