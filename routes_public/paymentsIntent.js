// routes_public/paymentsIntent.js — CANONICAL (pending by default)

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { request_id, provider, amount } = req.body;

  if (!request_id || !provider || !amount) {
    return res.status(400).json({ ok: false, error: "INVALID_PAYLOAD" });
  }

  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `
      INSERT INTO payments (request_id, provider, amount, status, created_at)
      VALUES ($1, $2, $3, 'pending', now())
      RETURNING id, request_id, amount, currency, status
      `,
      [request_id, provider, amount]
    );

    return res.json({
      ok: true,
      intent: rows[0],
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "PAYMENT_INTENT_FAILED",
    });
  } finally {
    client.release();
  }
});

export default router;
