// routes_system/paymentsWebhook.js — REAL PROD SCHEMA

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { payment_id, status } = req.body;

  if (!payment_id || status !== "succeeded") {
    return res.status(400).json({ ok: false, error: "INVALID_PAYLOAD" });
  }

  await pool.query(
    `
    UPDATE payments
    SET status = 'confirmed',
        updated_at = now()
    WHERE id = $1
    `,
    [payment_id]
  );

  return res.json({
    ok: true,
    payment_id,
    status: "confirmed",
  });
});

export default router;
