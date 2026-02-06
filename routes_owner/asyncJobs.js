// routes_owner/asyncJobs.js
import express from 'express';
import pool from '../db/index.js';
import { auditOwnerActionPg } from '../utils/auditOwnerActionPg.js';

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
 * OPS INSERT — audited (best-effort)
 */
router.post('/backfill', async (req, res) => {
  let client;
  try {
    const { job_type, payload, idempotency_key } = req.body;

    if (!job_type || !payload || !idempotency_key) {
      return res.status(400).json({ ok: false, error: 'invalid_request' });
    }

    client = await pool.connect();
    await client.query(
      `
      INSERT INTO async_jobs (job_type, payload, idempotency_key)
      VALUES ($1, $2::jsonb, $3)
      `,
      [job_type, payload, idempotency_key]
    );

    // audit (best-effort)
    await auditOwnerActionPg(client, {
      salon_slug: req.owner?.salon_slug,
      actor: { id: req.owner?.id, email: req.owner?.email },
      action_type: 'async_job_backfill',
      entity_type: 'async_job',
      entity_id: idempotency_key,
      request_id: req.headers['x-request-id'] || null,
      metadata: { job_type }
    });

    res.json({ ok: true, status: 'enqueued' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'duplicate_idempotency_key' });
    }
    console.error('[ASYNC_BACKFILL]', err);
    res.status(500).json({ ok: false, error: 'backfill_failed' });
  } finally {
    if (client) client.release();
  }
});

/**
 * POST /owner/async/jobs/:id/retry
 * OPS RETRY
 * - default: RESET (attempts=0, last_error=NULL)
 * - force=1: FORCE_RUN (attempts unchanged)
 */
router.post('/jobs/:id/retry', async (req, res) => {
  const jobId = Number(req.params.id);
  const force = String(req.query.force || '') === '1';

  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ ok: false, error: 'invalid_job_id' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(
      `
      SELECT id, status, attempts, max_attempts
      FROM async_jobs
      WHERE id = $1
      FOR UPDATE
      `,
      [jobId]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'job_not_found' });
    }

    const job = rows[0];

    if (job.status === 'done') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'job_already_done' });
    }

    if (!force && job.attempts >= job.max_attempts) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'max_attempts_reached' });
    }

    if (force) {
      await client.query(
        `
        UPDATE async_jobs
        SET status = 'pending',
            run_at = now(),
            updated_at = now()
        WHERE id = $1
        `,
        [jobId]
      );
    } else {
      await client.query(
        `
        UPDATE async_jobs
        SET status = 'pending',
            attempts = 0,
            last_error = NULL,
            run_at = now(),
            updated_at = now()
        WHERE id = $1
        `,
        [jobId]
      );
    }

    // audit (best-effort)
    await auditOwnerActionPg(client, {
      salon_slug: req.owner?.salon_slug,
      actor: { id: req.owner?.id, email: req.owner?.email },
      action_type: 'async_job_retry',
      entity_type: 'async_job',
      entity_id: String(jobId),
      request_id: req.headers['x-request-id'] || null,
      metadata: { force }
    });

    await client.query('COMMIT');
    res.json({ ok: true, job_id: jobId, force });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[ASYNC_JOB_RETRY]', err);
    res.status(500).json({ ok: false, error: 'retry_failed' });
  } finally {
    if (client) client.release();
  }
});

export default router;
