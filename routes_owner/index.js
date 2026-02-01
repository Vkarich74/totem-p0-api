// routes_owner/index.js
import express from 'express';
import pool from '../db/index.js';
import { authOwner } from '../middleware/auth_owner.js';
import { runQueueWorker } from '../jobs/queueWorker.js';

const router = express.Router();
router.use(authOwner);

// READ SALONS
router.get('/salons', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT slug, name FROM salons ORDER BY name`
  );
  res.json({ ok: true, salons: rows });
});

// 🔥 OPS: MANUAL WORKER RUN (PROD SAFE)
router.post('/ops/run-worker', async (_req, res) => {
  try {
    await runQueueWorker({ limit: 10 });
    res.json({ ok: true, status: 'worker_ran' });
  } catch (err) {
    console.error('[OPS_RUN_WORKER]', err);
    res.status(500).json({ ok: false, error: 'worker_failed' });
  }
});

export default router;
