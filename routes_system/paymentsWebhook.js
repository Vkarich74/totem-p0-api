// routes_system/paymentsWebhook.js — CANONICAL FINAL
// Contract:
// - Auth: X-System-Token
// - Input: payment_id, status = 'succeeded' | 'failed'
// - Allowed transition: pending -> confirmed | failed
// - Idempotent for confirmed / failed
// - Booking moves to 'paid' ONLY on confirmed

import express from "express";
import { pool } from "../db/index.js";
import updateBookingStatus from "../helpers/updateBookingStatus.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { payment_id, status } = req.body || {};

  if (!payment_id || !["succeeded", "failed"].includes(status)) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_PAYLOAD",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ lock payment row
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
      throw new Error("PAYMENT_NOT_FOUND");
    }

    const payment = rows[0];

    // 2️⃣ idempotency
    if (payment.status === "confirmed" || payment.status === "failed") {
      await client.query("COMMIT");
      return res.json({
        ok: true,
        idempotent: true,
        payment_id,
        booking_id: payment.booking_id,
        booking_status: payment.status === "confirmed" ? "paid" : undefined,
      });
    }

    // 3️⃣ only pending allowed
    if (payment.status !== "pending") {
      throw new Error("INVALID_STATUS_TRANSITION");
    }

    // 4️⃣ resolve payment
    const nextStatus = status === "succeeded" ? "confirmed" : "failed";

    await client.query(
      `
      UPDATE payments
      SET status = $2,
          updated_at = now()
      WHERE id = $1
      `,
      [payment_id, nextStatus]
    );

    // 5️⃣ booking update ONLY on confirmed
    if (nextStatus === "confirmed") {
      await updateBookingStatus(
        client,
        payment.booking_id,
        "paid",
        { type: "system", id: "payments-webhook" },
        "/payments/webhook"
      );
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      payment_id,
      booking_id: payment.booking_id,
      booking_status: nextStatus === "confirmed" ? "paid" : undefined,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({
      ok: false,
      error: err.message || "INTERNAL_ERROR",
    });
  } finally {
    client.release();
  }
});

export default router;
