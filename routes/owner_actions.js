console.log("OWNER_ACTIONS_MARKER_2026_02_01");

import express from "express";
import { pool } from "../db/index.js";
import systemOwnerGuard from "../middleware/system_owner_guard.js";
import { auditOwnerAction } from "../utils/auditOwnerAction.js";

const router = express.Router();

/**
 * OWNER OPS (SCOPED)
 * POST /owner/period/:id/close
 */
router.post("/owner/period/:id/close", systemOwnerGuard, async (req, res) => {
  const { id } = req.params;
  const { salon_slug } = req.user;

  try {
    const result = await pool.query(
      `
      UPDATE settlement_periods sp
      SET status = 'closed',
          closed_at = now()
      WHERE sp.id = $1
        AND sp.status = 'open'
        AND EXISTS (
          SELECT 1
          FROM payouts p
          JOIN bookings b ON b.id = p.booking_id
          WHERE p.settlement_period_id = sp.id
            AND b.salon_slug = $2
        )
      RETURNING sp.id, sp.status, sp.closed_at
      `,
      [id, salon_slug]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND_OR_NOT_OWNED",
      });
    }

    await auditOwnerAction({
      req,
      action_type: "PERIOD_CLOSE",
      entity_type: "settlement_period",
      entity_id: String(id),
      metadata: {
        status: result.rows[0].status,
        closed_at: result.rows[0].closed_at,
      },
    });

    res.json({ ok: true, period: result.rows[0] });
  } catch (err) {
    console.error("OWNER_CLOSE_PERIOD_ERROR", err);
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

/**
 * OWNER OPS (SCOPED)
 * POST /owner/batch/:id/pay
 */
router.post("/owner/batch/:id/pay", systemOwnerGuard, async (req, res) => {
  const { id } = req.params;
  const { salon_slug } = req.user;

  try {
    const batch = await pool.query(
      `
      SELECT sb.id, sb.status
      FROM settlement_payout_batches sb
      WHERE sb.id = $1
        AND EXISTS (
          SELECT 1
          FROM payouts p
          JOIN bookings b ON b.id = p.booking_id
          WHERE p.payout_batch_id = sb.id
            AND b.salon_slug = $2
        )
      `,
      [id, salon_slug]
    );

    if (batch.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND_OR_NOT_OWNED",
      });
    }

    if (batch.rows[0].status === "paid") {
      return res.json({ ok: true, idempotent: true });
    }

    await pool.query(
      `
      UPDATE settlement_payout_batches
      SET status = 'paid',
          paid_at = now()
      WHERE id = $1
      `,
      [id]
    );

    await auditOwnerAction({
      req,
      action_type: "BATCH_PAY",
      entity_type: "settlement_payout_batch",
      entity_id: String(id),
      metadata: {
        previous_status: batch.rows[0].status,
        new_status: "paid",
      },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("OWNER_PAY_BATCH_ERROR", err);
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default router;
