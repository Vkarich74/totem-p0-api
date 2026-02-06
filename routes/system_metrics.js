// routes/system_metrics.js
import express from 'express';
import { db } from '../db/index.js';

const router = express.Router();

router.get('/system/metrics', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM payments) AS payments_total,
        (SELECT COUNT(*) FROM payouts) AS payouts_total,
        (SELECT COUNT(*) FROM settlement_payout_batches WHERE status = 'ready') AS batches_ready,
        (SELECT COUNT(*) FROM settlement_payout_batches WHERE status = 'paid') AS batches_paid,
        (SELECT COALESCE(SUM(gross_amount),0) FROM payouts) AS gmv_total,
        (SELECT COALESCE(SUM(platform_fee),0) FROM payouts) AS platform_revenue
    `);

    res.json({
      ok: true,
      metrics: result.rows[0],
    });
  } catch (err) {
    console.error('SYSTEM_METRICS_ERROR', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
