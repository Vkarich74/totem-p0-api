import express from "express";
import { pool } from "../db/index.js";
import systemOwnerGuard from "../middleware/system_owner_guard.js";

const router = express.Router();

/**
 * SYSTEM OPS
 * POST /owner/period/:id/close
 */
router.post("/owner/period/:id/close", systemOwnerGuard, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    const result = await client.query(
      `
      UPDATE settlement_periods
      SET status = 'closed',
          closed_at = now()
      WHERE id = $1
        AND status = 'open'
      RETURNING id, status, closed_at
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    res.json({ ok: true, period: result.rows[0] });
  } catch (err) {
    console.error("OWNER_CLOSE_PERIOD_ERROR", err);
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  } finally {
    client.release();
  }
});

/**
 * SYSTEM OPS
 * POST /owner/batch/:id/pay
 */
router.post("/owner/batch/:id/pay", systemOwnerGuard, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    const batch = await client.query(
      `
      SELECT id, status
      FROM settlement_payout_batches
      WHERE id = $1
      `,
      [id]
    );

    if (batch.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    if (batch.rows[0].status === "paid") {
      return res.json({ ok: true, idempotent: true });
    }

    await client.query(
      `
      UPDATE settlement_payout_batches
      SET status = 'paid',
          paid_at = now()
      WHERE id = $1
      `,
      [id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("OWNER_PAY_BATCH_ERROR", err);
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  } finally {
    client.release();
  }
});

export default router;
