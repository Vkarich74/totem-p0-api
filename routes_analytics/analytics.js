import express from 'express';
import {
  getSalonLTV,
  getMasterCommissions,
  getMonthlyRetention
} from '../services_analytics/core.js';

const router = express.Router();

/**
 * GET /analytics/salon/ltv?salon_id=1&from=YYYY-MM-DD&to=YYYY-MM-DD
 */
router.get('/salon/ltv', (req, res) => {
  const { salon_id, from, to } = req.query;
  if (!salon_id) {
    return res.status(400).json({ error: 'SALON_ID_REQUIRED' });
  }
  const data = getSalonLTV({ salon_id, from, to });
  res.json({ ok: true, data });
});

/**
 * GET /analytics/masters/commissions?from=&to=&limit=50
 */
router.get('/masters/commissions', (req, res) => {
  const { from, to, limit } = req.query;
  const data = getMasterCommissions({ from, to, limit });
  res.json({ ok: true, data });
});

/**
 * GET /analytics/retention?from=&to=
 */
router.get('/retention', (req, res) => {
  const { from, to } = req.query;
  const data = getMonthlyRetention({ from, to });
  res.json({ ok: true, data });
});

export default router;
