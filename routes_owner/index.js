// routes_owner/index.js
import express from 'express';
import pool from '../db/index.js';
import { authOwner } from '../middleware/auth_owner.js';
import { runQueueWorker } from '../jobs/queueWorker.js';
import asyncJobsRouter from './asyncJobs.js';

const router = express.Router();
router.use(authOwner);

/**
 * READ: salons
 */
router.get('/salons', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT slug, name FROM salons ORDER BY name`
  );
  res.json({ ok: true, salons: rows });
});

/**
 * OPS: manual async worker run
 */
router.post('/ops/run-worker', async (_req, res) => {
  try {
    await runQueueWorker({ limit: 10 });
    res.json({ ok: true, status: 'worker_ran' });
  } catch (err) {
    console.error('[OPS_RUN_WORKER]', err);
    res.status(500).json({ ok: false, error: 'worker_failed' });
  }
});

/**
 * ASYNC JOBS (READ / RETRY / BACKFILL)
 */
router.use('/async', asyncJobsRouter);

export default router;
