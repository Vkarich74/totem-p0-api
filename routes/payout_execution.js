// routes/payout_execution.js
import express from 'express';
import { db } from '../db/index.js';

const router = express.Router();

router.post('/payouts/execute', async (req, res) => {
  const { booking_id } = req.body;

  if (!booking_id) {
    return res.status(400).json({ error: 'booking_id_required' });
  }

  try {
    const paymentResult = await db.query(
      `
      SELECT id, amount
      FROM payments
      WHERE booking_id = $1
        AND status = 'succeeded'
        AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [booking_id]
    );

    if (!paymentResult.rows || paymentResult.rows.length === 0) {
      return res.status(400).json({ error: 'payment_not_found' });
    }

    const payment = paymentResult.rows[0];

    const existingResult = await db.query(
      `SELECT id FROM payouts WHERE booking_id = $1`,
      [booking_id]
    );

    if (existingResult.rows.length > 0) {
      return res.json({ ok: true, payout_id: existingResult.rows[0].id, idempotent: true });
    }

    const insertResult = await db.query(
      `
      INSERT INTO payouts (booking_id, payment_id, amount, status)
      VALUES ($1, $2, $3, 'created')
      RETURNING id
      `,
      [booking_id, payment.id, payment.amount]
    );

    return res.json({ ok: true, payout_id: insertResult.rows[0].id });
  } catch (err) {
    // 🔥 ВРЕМЕННО ВОЗВРАЩАЕМ ДЕТАЛИ
    console.error('PAYOUT_EXECUTION_ERROR', err);
    return res.status(500).json({
      error: 'internal_error',
      detail: err?.message,
      code: err?.code
    });
  }
});

export default router;
