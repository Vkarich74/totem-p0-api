// routes_owner/asyncJobs.js
import express from 'express';
import pool from '../db/index.js';

const router = express.Router();

/**
 * GET /owner/async/jobs
 * OPS READ — no salon filter (ops jobs)
 */
router.get('/jobs', async (req, res) => {
  try {
    const { status, job_type } = req.query;

    const { rows } = await pool.query(
      `
      SELECT id, job_type, status, attempts, max_attempts, run_at, last_error, created_at
      FROM async_jobs
      WHERE ($1::text IS NULL OR status = $1)
        AND ($2::text IS NULL OR job_type = $2)
      ORDER BY created_at DESC
      LIMIT 200
      `,
      [status || null, job_type || null]
    );

    res.json({ ok: true, jobs: rows });
  } catch (err) {
    console.error('[ASYNC_JOBS_READ]', err);
    res.status(500).json({ ok: false, error: 'read_failed' });
  }
});

/**
 * POST /owner/async/backfill
 * OPS INSERT — no audit yet
 */
router.post('/backfill', async (req, res) => {
  try {
    const { job_type, payload, idempotency_key } = req.body;

    if (!job_type || !payload || !idempotency_key) {
      return res.status(400).json({ ok: false, error: 'invalid_request' });
    }

    await pool.query(
      `
      INSERT INTO async_jobs (job_type, payload, idempotency_key)
      VALUES ($1, $2::jsonb, $3)
      `,
      [job_type, payload, idempotency_key]
    );

    res.json({ ok: true, status: 'enqueued' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'duplicate_idempotency_key' });
    }
    console.error('[ASYNC_BACKFILL]', err);
    res.status(500).json({ ok: false, error: 'backfill_failed' });
  }
});

export default router;
