// routes_owner/asyncJobs.js
import express from 'express';
import pool from '../db/index.js';
import auditOwnerAction from '../utils/auditOwnerAction.js';

const router = express.Router();

/**
 * GET /owner/async/jobs
 * filters: status, job_type, from, to
 */
router.get('/async/jobs', async (req, res) => {
  const { status, job_type, from, to } = req.query;
  const { salon_slug } = req.owner;

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
    [status || null, job_type || null, from || null, to || null, salon_slug]
  );

  res.json({ ok: true, jobs: rows });
});

/**
 * POST /owner/async/jobs/:id/retry
 */
router.post('/async/jobs/:id/retry', async (req, res) => {
  const id = Number(req.params.id);
  const owner = req.owner;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `
      SELECT *
      FROM async_jobs
      WHERE id = $1
        AND payload->>'salon_slug' = $2
      FOR UPDATE
      `,
      [id, owner.salon_slug]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    const job = rows[0];

    if (job.status !== 'failed') {
      await client.query('ROLLBACK');
      return res.json({ ok: true, status: 'no_change' });
    }

    if (job.attempts >= job.max_attempts) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'max_attempts_reached' });
    }

    await auditOwnerAction(client, {
      salon_slug: owner.salon_slug,
      actor_user_id: owner.id,
      actor_email: owner.email,
      action_type: 'async_job_retry',
      entity_type: 'async_job',
      entity_id: String(id),
      metadata: { previous_status: job.status }
    });

    await client.query(
      `
      UPDATE async_jobs
      SET status = 'pending',
          attempts = attempts + 1,
          last_error = NULL,
          run_at = now(),
          updated_at = now()
      WHERE id = $1
      `,
      [id]
    );

    await client.query('COMMIT');
    res.json({ ok: true, status: 'requeued' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ ok: false, error: 'retry_failed' });
  } finally {
    client.release();
  }
});

/**
 * POST /owner/async/backfill
 */
router.post('/async/backfill', async (req, res) => {
  const { job_type, payload, idempotency_key } = req.body;
  const owner = req.owner;

  if (!job_type || !payload || !idempotency_key) {
    return res.status(400).json({ ok: false, error: 'invalid_request' });
  }

  if (payload.salon_slug !== owner.salon_slug) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await auditOwnerAction(client, {
      salon_slug: owner.salon_slug,
      actor_user_id: owner.id,
      actor_email: owner.email,
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
