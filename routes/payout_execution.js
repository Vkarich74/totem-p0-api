import express from "express";
import db from "../db/index.js";

const router = express.Router();

/**
 * POST /payouts/execute
 * Input: { booking_id }
 *
 * Strategy:
 * - find succeeded payment
 * - detect UUID column in payments
 * - insert payout with REQUIRED payment_id
 */
router.post("/payouts/execute", async (req, res) => {
  try {
    const { booking_id } = req.body;

    if (typeof booking_id !== "number") {
      return res.status(400).json({ error: "invalid_booking_id" });
    }

    if (!db || db.mode !== "postgres") {
      return res.status(500).json({ error: "db_mode_error", mode: db && db.mode });
    }

    // 1) Найти payment (любая строка succeeded)
    const payment = await db.oneOrNone(
      `
      SELECT *
      FROM payments
      WHERE booking_id = $1
        AND status = 'succeeded'
      ORDER BY id DESC
      LIMIT 1
      `,
      [booking_id]
    );

    if (!payment) {
      return res.status(404).json({ error: "payment_not_succeeded" });
    }

    // 2) Guard: payout уже есть
    const existing = await db.oneOrNone(
      `SELECT id FROM payouts WHERE booking_id = $1 LIMIT 1`,
      [booking_id]
    );
    if (existing) {
      return res.status(409).json({ error: "already_paid" });
    }

    // 3) Найти UUID-колонку в payments (кроме id)
    const uuidCol = await db.oneOrNone(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'payments'
        AND data_type = 'uuid'
        AND column_name <> 'id'
      LIMIT 1
      `
    );

    if (!uuidCol || !payment[uuidCol.column_name]) {
      return res.status(500).json({
        error: "payment_uuid_not_found",
        detail: "No UUID column with value found in payments"
      });
    }

    const paymentUuid = payment[uuidCol.column_name];

    // 4) Insert payout (payment_id ОБЯЗАТЕЛЕН)
    const payout = await db.runInTx(async (tx) => {
      return tx.oneOrNone(
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
          paymentUuid,
          payment.amount
        ]
      );
    });

    return res.json({ ok: true, payout_id: payout.id });
  } catch (e) {
    console.error("PAYOUT_EXECUTE_FATAL", e);
    return res.status(500).json({ error: "fatal", message: e.message });
  }
});

export default router;
