// routes_system/paymentsWebhook.js — lifecycle v2 + AUDIT (Postgres)

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

    // 1️⃣ confirm payment
    const { rows, rowCount } = await client.query(
      `
      UPDATE payments
      SET status = 'confirmed',
          updated_at = now()
      WHERE id = $1
      RETURNING booking_id
      `,
      [payment_id]
    );

    if (rowCount === 0) {
      throw new Error("PAYMENT_NOT_FOUND");
    }

    const bookingId = rows[0].booking_id;

    // 2️⃣ move booking → paid (WITH AUDIT)
    await updateBookingStatus(
      client,
      bookingId,
      "paid",
      { type: "system", id: "payments-webhook" },
      "/payments/webhook"
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      payment_id,
      booking_id: bookingId,
      booking_status: "paid",
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
