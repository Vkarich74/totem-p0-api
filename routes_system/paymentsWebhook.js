// routes_system/paymentsWebhook.js — CANONICAL FINAL (SECURED)
// Contract:
// - Auth: X-System-Token
// - Input: payment_id, status = 'succeeded' | 'failed'
// - Idempotent
// - Booking moves to 'paid' ONLY via updateBookingStatus

import express from "express";
import { pool } from "../db/index.js";
import updateBookingStatus from "../helpers/updateBookingStatus.js";

const router = express.Router();

// 🔐 simple system auth
function requireSystemToken(req, res, next) {
  const token =
    req.headers["x-system-token"] ||
    req.headers["X-System-Token"];

  if (!process.env.SYSTEM_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: "SYSTEM_TOKEN_NOT_CONFIGURED",
    });
  }

  if (token !== process.env.SYSTEM_TOKEN) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  next();
}

router.post("/", requireSystemToken, async (req, res) => {
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
      return res.status(404).json({
        ok: false,
        error: "PAYMENT_NOT_FOUND",
      });
    }

    const payment = rows[0];

    // idempotency
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

    if (payment.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        error: "INVALID_STATUS_TRANSITION",
      });
    }

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
    console.error("paymentsWebhook error:", err);
    return res.status(500).json({
      ok: false,
      error: "PAYMENTS_WEBHOOK_FAILED",
    });
  } finally {
    client.release();
  }
});

export default router;
