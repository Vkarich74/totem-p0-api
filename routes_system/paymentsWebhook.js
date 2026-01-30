// routes_system/paymentsWebhook.js — lifecycle v3 (idempotent, safe)

import express from "express";
import { pool } from "../db/index.js";
import updateBookingStatus from "../helpers/updateBookingStatus.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { payment_id, status } = req.body;

  if (!payment_id || status !== "succeeded") {
    return res.status(400).json({ ok: false, error: "INVALID_PAYLOAD" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ load payment with lock
    const { rows, rowCount } = await client.query(
      `
      SELECT id, status, booking_id
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

    // 2️⃣ idempotency: already confirmed
    if (payment.status === "confirmed") {
      await client.query("COMMIT");
      return res.json({
        ok: true,
        idempotent: true,
        payment_id,
        booking_id: payment.booking_id,
        booking_status: "paid",
      });
    }

    // 3️⃣ invalid transition
    if (payment.status !== "pending") {
      throw new Error("INVALID_STATUS_TRANSITION");
    }

    // 4️⃣ confirm payment
    await client.query(
      `
      UPDATE payments
      SET status = 'confirmed',
          updated_at = now()
      WHERE id = $1
      `,
      [payment_id]
    );

    // 5️⃣ move booking → paid
    await updateBookingStatus(
      client,
      payment.booking_id,
      "paid",
      { type: "system", id: "payments-webhook" },
      "/payments/webhook"
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      payment_id,
      booking_id: payment.booking_id,
      booking_status: "paid",
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
