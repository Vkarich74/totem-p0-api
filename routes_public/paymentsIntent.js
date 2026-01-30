// routes_public/paymentsIntent.js — CANONICAL (booking_id based, pending only)

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

/**
 * Create payment intent for booking
 * Contract:
 * - input: booking_id, provider, amount
 * - one active payment per booking
 * - status ALWAYS starts as 'pending'
 */
router.post("/", async (req, res) => {
  const { booking_id, provider, amount } = req.body || {};

  if (!booking_id || !provider || !amount) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_PAYLOAD",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ deactivate previous active payment for this booking
    await client.query(
      `
      UPDATE payments
      SET is_active = false
      WHERE booking_id = $1
        AND is_active = true
      `,
      [booking_id]
    );

    // 2️⃣ create new payment intent (pending)
    const { rows } = await client.query(
      `
      INSERT INTO payments (
        booking_id,
        provider,
        amount,
        status,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'pending',
        true,
        now(),
        now()
      )
      RETURNING
        id,
        booking_id,
        provider,
        amount,
        status,
        is_active
      `,
      [booking_id, provider, amount]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      intent: rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("paymentsIntent error:", err);
    return res.status(500).json({
      ok: false,
      error: "PAYMENT_INTENT_FAILED",
    });
  } finally {
    client.release();
  }
});

export default router;
