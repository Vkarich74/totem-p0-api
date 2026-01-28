import express from 'express';
import { getPricingMetrics } from '../services_analytics/pricing.js';

const router = express.Router();

/**
 * GET /analytics/pricing?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
router.get('/pricing', (req, res) => {
  const { from, to } = req.query;
  const data = getPricingMetrics({ from, to });
  res.json({ ok: true, data });
});

export default router;
