// routes/system_close_period.js
// Close open settlement period
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
// POST /system/settlement/close-period
// Body: {}
// ------------------------------------------------------
router.post("/close-period", async (_req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // lock open period
    const p = await client.query(
      `SELECT * FROM settlement_periods WHERE status='open' LIMIT 1 FOR UPDATE`
    );

    if (!p.rowCount) {
      await client.query("ROLLBACK");
      return res.json({ ok: true, noop: true });
    }

    const periodId = p.rows[0].id;

    // mark batches paid
    await client.query(
      `
      UPDATE settlement_payout_batches
      SET status='paid', paid_at=now()
      WHERE settlement_period_id=$1 AND status!='paid'
      `,
      [periodId]
    );

    // close period
    await client.query(
      `
      UPDATE settlement_periods
      SET status='closed', closed_at=now()
      WHERE id=$1
      `,
      [periodId]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, period_id: periodId });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[SYSTEM CLOSE PERIOD]", e);
    return res.status(500).json({ error: "internal_error" });
  } finally {
    client.release();
  }
});

export default router;
