// routes/owner_dashboard.js
import express from 'express';
import { db } from '../db/index.js';

const router = express.Router();

/**
 * GET /owner/dashboard/kpi
 * Owner-level financial KPIs
 */
router.get('/owner/dashboard/kpi', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM report_owner_kpi LIMIT 1`
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'kpi_not_found' });
    }

    return res.json({
      ok: true,
      kpi: result.rows[0],
    });
  } catch (err) {
    console.error('OWNER_KPI_ERROR', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
