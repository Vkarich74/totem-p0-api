import express from "express";
import db from "../db/index.js";

const router = express.Router();

/**
 * POST /payouts/execute
 * Input: { booking_id }
 *
 * PROD FACTS:
 * - payouts.payment_id EXISTS and NOT NULL (UUID)
 * - payments.payment_id is UUID (provider / external)
 * - payments.id is INTEGER (internal) — НЕ используем
 */
router.post("/payouts/execute", async (req, res) => {
  try {
    const { booking_id } = req.body;

    if (typeof booking_id !== "number") {
      return res.status(400).json({ error: "invalid_booking_id" });
    }

    // PROD = Postgres only
    if (!db || db.mode !== "postgres") {
      return res.status(500).json({ error: "db_mode_error", mode: db && db.mode });
    }

    // 1) Берём UUID payment_id + amount из payments
    const payment = await db.oneOrNone(
      `
      SELECT payment_id, amount
      FROM payments
      WHERE booking_id = $1
        AND status = 'succeeded'
      ORDER BY id DESC
      LIMIT 1
      `,
      [booking_id]
    );

    if (!payment || !payment.payment_id) {
      return res.status(404).json({ error: "payment_not_succeeded" });
    }

    // 2) Guard: один payout на booking
    const existing = await db.oneOrNone(
      `
      SELECT id
      FROM payouts
      WHERE booking_id = $1
      LIMIT 1
      `,
      [booking_id]
    );

    if (existing) {
      return res.status(409).json({ error: "already_paid" });
    }

    // 3) INSERT с ОБЯЗАТЕЛЬНЫМ payment_id (UUID)
    const payout = await db.runInTx(async (tx) => {
      const row = await tx.oneOrNone(
        `
        INSERT INTO payouts (
          booking_id,
          payment_id,
          amount,
          status,
          created_at
        )
        VALUES ($1, $2, $3, 'executed', NOW())
        RETURNING id
        `,
        [
          booking_id,
          payment.payment_id, // UUID — КЛЮЧЕВО
          payment.amount
        ]
      );
      return row;
    });

    return res.json({ ok: true, payout_id: payout.id });
  } catch (e) {
    console.error("PAYOUT_EXECUTE_FATAL", e);
    return res.status(500).json({ error: "fatal", message: e.message });
  }
});

export default router;
