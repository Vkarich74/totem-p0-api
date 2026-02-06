// routes/system_reconciliation_period.js
// Reconciliation by settlement period (read-only)
// AUTH: X-System-Token

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

// auth
router.use((req, res, next) => {
  const token = req.header("X-System-Token");
  if (!token || token !== process.env.SYSTEM_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

// ------------------------------------------------------
// GET /system/reconciliation/period?period_id=
// ------------------------------------------------------
router.get("/period", async (req, res) => {
  const { period_id } = req.query;
  if (!period_id) return res.status(400).json({ error: "period_id_required" });

  try {
    // payouts inside period
    const payouts = await pool.query(
      `
      SELECT
        COUNT(*)::int cnt,
        COALESCE(SUM(gross_amount),0)::int sum
      FROM payouts
      WHERE settlement_period_id = $1 AND status='paid'
      `,
      [period_id]
    );

    // batches inside period
    const batches = await pool.query(
      `
      SELECT
        COUNT(*)::int cnt,
        COALESCE(SUM(total_gross),0)::int sum
      FROM settlement_payout_batches
      WHERE settlement_period_id = $1 AND status='paid'
      `,
      [period_id]
    );

    // payments linked to payouts of this period
    const payments = await pool.query(
      `
      SELECT
        COUNT(DISTINCT p.id)::int cnt,
        COALESCE(SUM(p.amount),0)::int sum
      FROM payments p
      JOIN payouts po ON po.payment_id = p.id
      WHERE po.settlement_period_id = $1 AND po.status='paid'
      `,
      [period_id]
    );

    return res.json({
      ok: true,
      period_id: Number(period_id),
      payments: payments.rows[0],
      payouts: payouts.rows[0],
      batches: batches.rows[0],
      matched:
        payments.rows[0].sum === payouts.rows[0].sum &&
        payouts.rows[0].sum === batches.rows[0].sum,
    });
  } catch (e) {
    console.error("[RECONCILIATION PERIOD]", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
