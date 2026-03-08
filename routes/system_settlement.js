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

    // lock payout + resolve salon
    const p = await client.query(
      `
      SELECT
        p.*,
        b.salon_id
      FROM payouts p
      LEFT JOIN bookings b ON b.id = p.booking_id
      WHERE p.id = $1
      FOR UPDATE
      `,
      [payout_id]
    );

    if (!p.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "payout_not_found" });
    }

    const payout = p.rows[0];

    if (!payout.salon_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "salon_id_not_resolved" });
    }

    if (
      payout.status === "paid" &&
      payout.settlement_period_id &&
      payout.payout_batch_id
    ) {
      await client.query("ROLLBACK");
      return res.json({
        ok: true,
        noop: true,
        payout_id: payout.id,
        period_id: payout.settlement_period_id,
        batch_id: payout.payout_batch_id,
        salon_id: payout.salon_id,
      });
    }

    if (payout.settlement_period_id || payout.payout_batch_id) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "payout_already_attached",
        payout_id: payout.id,
        settlement_period_id: payout.settlement_period_id,
        payout_batch_id: payout.payout_batch_id,
      });
    }

    // get or create open settlement period for this salon
    let period = await client.query(
      `
      SELECT *
      FROM settlement_periods
      WHERE salon_id = $1
        AND status = 'open'
        AND is_archived = false
      LIMIT 1
      FOR UPDATE
      `,
      [payout.salon_id]
    );

    if (!period.rowCount) {
      const today = new Date().toISOString().slice(0, 10);
      const ins = await client.query(
        `
        INSERT INTO settlement_periods (
          period_start,
          period_end,
          status,
          salon_id,
          is_archived
        )
        VALUES ($1, $1, 'open', $2, false)
        RETURNING *
        `,
        [today, payout.salon_id]
      );
      period = { rows: [ins.rows[0]], rowCount: 1 };
    }

    const periodId = period.rows[0].id;

    // get or create batch for this period
    let batch = await client.query(
      `
      SELECT *
      FROM settlement_payout_batches
      WHERE settlement_period_id = $1
      FOR UPDATE
      `,
      [periodId]
    );

    if (!batch.rowCount) {
      const ins = await client.query(
        `
        INSERT INTO settlement_payout_batches
          (
            settlement_period_id,
            total_gross,
            total_platform_fee,
            total_provider_amount,
            status,
            salon_id
          )
        VALUES ($1, 0, 0, 0, 'ready', $2)
        RETURNING *
        `,
        [periodId, payout.salon_id]
      );
      batch = { rows: [ins.rows[0]], rowCount: 1 };
    }

    const batchId = batch.rows[0].id;

    // attach payout to period & batch and mark paid
    const upd = await client.query(
      `
      UPDATE payouts
      SET
        status='paid',
        settlement_period_id=$2,
        payout_batch_id=$3
      WHERE id=$1
        AND settlement_period_id IS NULL
        AND payout_batch_id IS NULL
      RETURNING id
      `,
      [payout_id, periodId, batchId]
    );

    if (!upd.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "payout_attach_conflict" });
    }

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
        Number(payout.gross_amount || 0),
        Number(payout.platform_fee || 0),
        Number(payout.provider_amount || 0),
      ]
    );

    // keep rolling period current
    await client.query(
      `
      UPDATE settlement_periods
      SET period_end = GREATEST(period_end, CURRENT_DATE)
      WHERE id = $1
      `,
      [periodId]
    );

    await client.query("COMMIT");
    return res.json({
      ok: true,
      batch_id: batchId,
      period_id: periodId,
      payout_id: payout.id,
      salon_id: payout.salon_id,
      rolling: true,
    });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {}
    console.error("[SYSTEM SETTLEMENT]", e);
    return res.status(500).json({ error: "internal_error" });
  } finally {
    client.release();
  }
});

export default router;