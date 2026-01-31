import express from "express";
import { pool } from "../db/index.js";
import systemOwnerGuard from "../middleware/system_owner_guard.js";

const router = express.Router();

/**
 * OWNER OPS (SCOPED)
 * POST /owner/period/:id/close
 *
 * Закрыть settlement-период ТОЛЬКО если
 * он реально относится к salon_slug владельца
 * (через payouts → bookings)
 */
router.post("/owner/period/:id/close", systemOwnerGuard, async (req, res) => {
  const { id } = req.params;
  const { salon_slug } = req.user;

  const client = await pool.connect();
  try {
    const result = await client.query(
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

    res.json({ ok: true, period: result.rows[0] });
  } catch (err) {
    console.error("OWNER_CLOSE_PERIOD_ERROR", err);
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  } finally {
    client.release();
  }
});

/**
 * OWNER OPS (SCOPED)
 * POST /owner/batch/:id/pay
 *
 * Оплатить payout-batch ТОЛЬКО если
 * он принадлежит salon_slug владельца
 * (через payouts → bookings)
 */
router.post("/owner/batch/:id/pay", systemOwnerGuard, async (req, res) => {
  const { id } = req.params;
  const { salon_slug } = req.user;

  const client = await pool.connect();
  try {
    const batch = await client.query(
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
