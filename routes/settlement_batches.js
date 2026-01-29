// routes/settlement_batches.js
import express from 'express';
import { db } from '../db/index.js';

const router = express.Router();

/**
 * POST /settlements/batch/:id/pay
 * Marks settlement batch as paid (idempotent)
 */
router.post('/settlements/batch/:id/pay', async (req, res) => {
  const batchId = req.params.id;

  try {
    const batchRes = await db.query(
      `SELECT id, status FROM settlement_payout_batches WHERE id = $1`,
      [batchId]
    );

    if (batchRes.rows.length === 0) {
      return res.status(404).json({ error: 'batch_not_found' });
    }

    const batch = batchRes.rows[0];

    if (batch.status === 'paid') {
      return res.json({ ok: true, idempotent: true });
    }

    await db.query(
      `
      UPDATE settlement_payout_batches
      SET status = 'paid',
          paid_at = now()
      WHERE id = $1
      `,
      [batchId]
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('SETTLEMENT_BATCH_PAY_ERROR', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
