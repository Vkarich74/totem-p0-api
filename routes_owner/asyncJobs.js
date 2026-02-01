// routes_owner/asyncJobs.js
import express from 'express';
import pool from '../db/index.js';
import { auditOwnerActionPg } from '../utils/auditOwnerActionPg.js';

const router = express.Router();

/**
 * GET /owner/async/jobs
 */
router.get('/jobs', async (req, res) => {
  const { status, job_type, from, to } = req.query;
  const owner = req.actor;

  const { rows } = await pool.query(
    `
    SELECT id, job_type, status, attempts, max_attempts, run_at, last_error, created_at
    FROM async_jobs
    WHERE ($1::text IS NULL OR status = $1)
      AND ($2::text IS NULL OR job_type = $2)
      AND ($3::timestamp IS NULL OR created_at >= $3)
      AND ($4::timestamp IS NULL OR created_at <= $4)
      AND payload->>'salon_slug' = $5
    ORDER BY created_at DESC
    LIMIT 200
    `,
    [
      status || null,
      job_type || null,
      from || null,
      to || null,
      owner.salon_slug
    ]
  );

  res.json({ ok: true, jobs: rows });
});

/**
 * POST /owner/async/backfill
 */
router.post('/backfill', async (req, res) => {
  const { job_type, payload, idempotency_key } = req.body;
  const owner = req.actor;

  if (!job_type || !payload || !idempotency_key) {
    return res.status(400).json({ ok: false, error: 'invalid_request' });
  }

  if (payload.salon_slug !== owner.salon_slug) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await auditOwnerActionPg(client, {
      salon_slug: owner.salon_slug,
      actor: owner,
      action_type: 'async_job_backfill',
      entity_type: 'async_job',
      entity_id: null,
      metadata: { job_type, idempotency_key }
    });

    await client.query(
      `
      INSERT INTO async_jobs (job_type, payload, idempotency_key)
      VALUES ($1, $2::jsonb, $3)
      `,
      [job_type, payload, idempotency_key]
    );

    await client.query('COMMIT');
    res.json({ ok: true, status: 'enqueued' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'duplicate_idempotency_key' });
    }
    console.error(err);
    res.status(500).json({ ok: false, error: 'backfill_failed' });
  } finally {
    client.release();
  }
});

export default router;
