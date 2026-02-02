// routes/system_reconciliation.js
// Read-only reconciliation report
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
// GET /system/reconciliation/summary
// ------------------------------------------------------
router.get("/summary", async (_req, res) => {
  try {
    const payments = await pool.query(
      `SELECT COUNT(*)::int cnt, COALESCE(SUM(amount),0)::int sum
       FROM payments WHERE status='confirmed'`
    );

    const payouts = await pool.query(
      `SELECT COUNT(*)::int cnt, COALESCE(SUM(gross_amount),0)::int sum
       FROM payouts WHERE status='paid'`
    );

    const batches = await pool.query(
      `SELECT COUNT(*)::int cnt,
              COALESCE(SUM(total_gross),0)::int sum
       FROM settlement_payout_batches WHERE status='paid'`
    );

    return res.json({
      ok: true,
      payments: payments.rows[0],
      payouts: payouts.rows[0],
      batches: batches.rows[0],
      matched:
        payments.rows[0].sum === payouts.rows[0].sum &&
        payouts.rows[0].sum === batches.rows[0].sum,
    });
  } catch (e) {
    console.error("[RECONCILIATION SUMMARY]", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
