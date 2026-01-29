// routes_public/paymentsIntent.js — REAL DB (idempotent)

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { request_id, provider, amount } = req.body;

  if (!request_id || !provider || !amount) {
    return res.status(400).json({ ok: false, error: "INVALID_PAYLOAD" });
  }

  const existing = await pool.query(
    "SELECT intent_id, amount, currency FROM payment_intents WHERE request_id=$1",
    [request_id]
  );

  if (existing.rows.length) {
    return res.json({
      ok: true,
      intent: existing.rows[0],
      idempotent: true,
    });
  }

  const { rows } = await pool.query(
    `INSERT INTO payment_intents (request_id, amount, currency, status)
     VALUES ($1, $2, 'KGS', 'created')
     RETURNING intent_id, request_id, amount, currency`,
    [request_id, amount]
  );

  return res.json({
    ok: true,
    intent: rows[0],
    idempotent: false,
  });
});

export default router;
