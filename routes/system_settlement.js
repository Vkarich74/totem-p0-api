// routes/system_settlement.js
// Close payouts into settlement period & batch
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
// POST /system/settlement/settle
// Body: { payout_id: string }
// ------------------------------------------------------
router.post("/settle", async (req, res) => {
  const { payout_id } = req.body;
  if (!payout_id) return res.status(400).json({ error: "payout_id_required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // lock payout
    const p = await client.query(
      `SELECT * FROM payouts WHERE id=$1 FOR UPDATE`,
      [payout_id]
    );
    if (!p.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "payout_not_found" });
    }

    if (p.rows[0].status === "paid") {
      await client.query("ROLLBACK");
      return res.json({ ok: true, noop: true });
    }

    // get or create open settlement period
    let period = await client.query(
      `SELECT * FROM settlement_periods WHERE status='open' LIMIT 1 FOR UPDATE`
    );

    if (!period.rowCount) {
      const today = new Date().toISOString().slice(0, 10);
      const ins = await client.query(
        `
        INSERT INTO settlement_periods (period_start, period_end, status)
        VALUES ($1, $1, 'open')
        RETURNING *
        `,
        [today]
      );
      period = { rows: [ins.rows[0]], rowCount: 1 };
    }

    const periodId = period.rows[0].id;

    // get or create batch for this period
    let batch = await client.query(
      `SELECT * FROM settlement_payout_batches WHERE settlement_period_id=$1 FOR UPDATE`,
      [periodId]
    );

    if (!batch.rowCount) {
      const ins = await client.query(
        `
        INSERT INTO settlement_payout_batches
          (settlement_period_id, total_gross, total_platform_fee, total_provider_amount, status)
        VALUES ($1, 0, 0, 0, 'ready')
        RETURNING *
        `,
        [periodId]
      );
      batch = { rows: [ins.rows[0]], rowCount: 1 };
    }

    const batchId = batch.rows[0].id;

    // attach payout to period & batch and mark paid
    await client.query(
      `
      UPDATE payouts
      SET
        status='paid',
        settlement_period_id=$2,
        payout_batch_id=$3
      WHERE id=$1
      `,
      [payout_id, periodId, batchId]
    );

    // update batch totals
    await client.query(
      `
      UPDATE settlement_payout_batches
      SET
        total_gross = total_gross + $2,
        total_platform_fee = total_platform_fee + $3,
        total_provider_amount = total_provider_amount + $4
      WHERE id=$1
      `,
      [
        batchId,
        p.rows[0].gross_amount,
        p.rows[0].platform_fee,
        p.rows[0].provider_amount,
      ]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, batch_id: batchId, period_id: periodId });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("[SYSTEM SETTLEMENT]", e);
    return res.status(500).json({ error: "internal_error" });
  } finally {
    client.release();
  }
});

export default router;
