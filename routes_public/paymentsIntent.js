// routes_public/paymentsIntent.js — REAL PROD SCHEMA

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { request_id, provider, amount } = req.body;

  if (!request_id || !provider || !amount) {
    return res.status(400).json({ ok: false, error: "INVALID_PAYLOAD" });
  }

  // request_id === booking_id
  const existing = await pool.query(
    `
    SELECT id, amount, provider, status
    FROM payments
    WHERE booking_id = $1 AND is_active = true
    `,
    [request_id]
  );

  if (existing.rows.length) {
    return res.json({
      ok: true,
      intent: {
        intent_id: existing.rows[0].id,
        request_id,
        amount: existing.rows[0].amount,
        currency: "KGS",
      },
      idempotent: true,
    });
  }

  const { rows } = await pool.query(
    `
    INSERT INTO payments
      (booking_id, amount, provider, status, is_active)
    VALUES
      ($1, $2, $3, 'created', true)
    RETURNING id
    `,
    [request_id, amount, provider]
  );

  return res.json({
    ok: true,
    intent: {
      intent_id: rows[0].id,
      request_id,
      amount,
      currency: "KGS",
    },
    idempotent: false,
  });
});

export default router;
