import express from 'express';
import { getCohorts } from '../services_analytics/cohorts.js';

const router = express.Router();

/**
 * GET /analytics/cohorts?windows=30,60,90
 */
router.get('/cohorts', (req, res) => {
  const windows = (req.query.windows || '30,60,90')
    .split(',')
    .map(v => Number(v))
    .filter(v => Number.isFinite(v) && v > 0);

  const data = getCohorts({ windows });
  res.json({ ok: true, data });
});

export default router;
