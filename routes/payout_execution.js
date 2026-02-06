// routes/payout_execution.js
import express from 'express';
import { db } from '../db/index.js';

const router = express.Router();

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

router.post('/payouts/execute', async (req, res) => {
  const { booking_id } = req.body;

  if (!booking_id) {
    return res.status(400).json({ error: 'booking_id_required' });
  }

  try {
    // 0) Должен существовать open settlement period
    const periodResult = await db.query(
      `
      SELECT id, period_start, period_end
      FROM settlement_periods
      WHERE status = 'open'
      ORDER BY period_start DESC
      LIMIT 1
      `
    );

    if (!periodResult.rows || periodResult.rows.length === 0) {
      return res.status(400).json({ error: 'no_open_settlement_period' });
    }

    const openPeriod = periodResult.rows[0];

    // 1) Найти активный succeeded payment
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

    // 2) Идемпотентность: payout уже существует?
    const existingResult = await db.query(
      `
      SELECT id, settlement_period_id
      FROM payouts
      WHERE booking_id = $1
      LIMIT 1
      `,
      [booking_id]
    );

    if (existingResult.rows && existingResult.rows.length > 0) {
      return res.json({
        ok: true,
        payout_id: existingResult.rows[0].id,
        idempotent: true
      });
    }

    // 3) Берём take_rate_bps (по умолчанию 1500 = 15%)
    const rateResult = await db.query(
      `
      SELECT value
      FROM platform_config
      WHERE key = 'take_rate_bps'
      LIMIT 1
      `
    );

    const takeRateBps = rateResult.rows && rateResult.rows.length > 0
      ? toInt(rateResult.rows[0].value, 1500)
      : 1500;

    // 4) Расчёт комиссий
    const grossAmount = toInt(payment.amount, 0);

    if (grossAmount <= 0) {
      return res.status(400).json({ error: 'invalid_payment_amount' });
    }

    // округляем как в SQL ROUND: nearest integer
    const platformFee = Math.round((grossAmount * takeRateBps) / 10000);
    const providerAmount = grossAmount - platformFee;

    if (platformFee < 0 || providerAmount < 0) {
      return res.status(500).json({ error: 'commission_calc_error' });
    }

    // 5) Создание payout (с периодом и расчётами)
    const insertResult = await db.query(
      `
      INSERT INTO payouts (
        booking_id,
        payment_id,
        settlement_period_id,
        amount,
        gross_amount,
        take_rate_bps,
        platform_fee,
        provider_amount,
        status
      )
      VALUES ($1, $2, $3, $4, $4, $5, $6, $7, 'created')
      RETURNING id
      `,
      [
        booking_id,
        payment.id,
        openPeriod.id,
        grossAmount,
        takeRateBps,
        platformFee,
        providerAmount
      ]
    );

    return res.json({
      ok: true,
      payout_id: insertResult.rows[0].id,
      settlement_period_id: openPeriod.id
    });
  } catch (err) {
    console.error('PAYOUT_EXECUTION_ERROR', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
