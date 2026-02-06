// routes/reports.js
import express from 'express';
import { db } from '../db/index.js';

const router = express.Router();

/**
 * GET /reports/periods
 * Финансовый отчёт по периодам
 */
router.get('/reports/periods', async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT *
      FROM report_financials_by_period
      ORDER BY period_start
      `
    );

    return res.json({
      ok: true,
      periods: result.rows,
    });
  } catch (err) {
    console.error('REPORT_PERIODS_ERROR', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /reports/batches
 * Отчёт по payout-батчам
 */
router.get('/reports/batches', async (req, res) => {
  try {
    const result = await db.query(
      `
      SELECT *
      FROM report_batches
      ORDER BY created_at DESC
      `
    );

    return res.json({
      ok: true,
      batches: result.rows,
    });
  } catch (err) {
    console.error('REPORT_BATCHES_ERROR', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
