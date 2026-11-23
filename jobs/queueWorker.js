// Existing Core queue worker. This file does NOT enable US jobs or auto-start.
// It can only execute explicitly registered handlers; no Admin approval bypass.
import { randomUUID } from "node:crypto";
import { pool } from "../db/index.js";

const JOB_TYPE = /^[a-z][a-z0-9_]{0,63}$/;
const defaultHandlers = Object.freeze({
  // Historical demonstration jobs are no-op and never log their payloads.
  example_log: async () => {},
});

const CLAIM_SQL = `
  WITH picked AS (
    SELECT id
    FROM public.async_jobs
    WHERE job_type = ANY($1::text[])
      AND attempts < max_attempts
      AND (
        (status = 'pending' AND run_at <= (now() AT TIME ZONE 'UTC'))
        OR (status = 'processing' AND lease_until <= now())
      )
    ORDER BY run_at, id
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.async_jobs AS job
  SET status = 'processing',
      attempts = job.attempts + 1,
      lease_owner = $2,
      lease_token = gen_random_uuid(),
      lease_until = now() + ($3::integer * interval '1 millisecond'),
      claimed_at = now(),
      updated_at = (now() AT TIME ZONE 'UTC')
  FROM picked
  WHERE job.id = picked.id
  RETURNING job.id, job.job_type, job.payload,
            job.attempts, job.max_attempts, job.lease_token
`;

async function claimNext(db, types, workerId, leaseMs) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(CLAIM_SQL, [types, workerId, leaseMs]);
    await client.query("COMMIT");
    return rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function resolveStaleExhausted(db, types) {
  // Never leave a max-attempts processing job stranded on an expired lease.
  await db.query(
    `UPDATE public.async_jobs
     SET status = 'failed', lease_owner = NULL, lease_token = NULL,
         lease_until = NULL, claimed_at = NULL,
         last_error = 'LEASE_EXPIRED_MAX_ATTEMPTS',
         updated_at = (now() AT TIME ZONE 'UTC')
     WHERE job_type = ANY($1::text[]) AND status = 'processing'
       AND lease_until <= now() AND attempts >= max_attempts`,
    [types],
  );
}

async function executeClaimed(db, job, handler, leaseMs) {
  const token = job.lease_token;
  const controller = new AbortController();
  let lost = false;
  let heartbeat = Promise.resolve();
  const interval = setInterval(() => {
    heartbeat = heartbeat.then(async () => {
      if (lost) return;
      const result = await db.query(
        `UPDATE public.async_jobs
         SET lease_until = now() + ($3::integer * interval '1 millisecond')
         WHERE id = $1 AND lease_token = $2 AND status = 'processing'
         RETURNING id`,
        [job.id, token, leaseMs],
      );
      if (result.rowCount !== 1) {
        lost = true;
        controller.abort();
      }
    }).catch(() => {
      lost = true;
      controller.abort();
    });
  }, Math.max(100, Math.floor(leaseMs / 3)));

  let failure = null;
  try {
    // Future US handlers MUST be idempotent at the business transaction level.
    // At-least-once job execution is NOT exactly-once external side effects.
    await handler(job.payload, { jobId: job.id, signal: controller.signal });
  } catch (error) {
    failure = error;
  } finally {
    clearInterval(interval);
    await heartbeat;
  }
  if (lost) return "lost_lease";

  if (!failure) {
    const result = await db.query(
      `UPDATE public.async_jobs
       SET status = 'done', lease_owner = NULL, lease_token = NULL,
           lease_until = NULL, claimed_at = NULL, last_error = NULL,
           updated_at = (now() AT TIME ZONE 'UTC')
       WHERE id = $1 AND lease_token = $2 AND status = 'processing'
       RETURNING id`,
      [job.id, token],
    );
    return result.rowCount === 1 ? "done" : "lost_lease";
  }

  const exhausted = job.attempts >= job.max_attempts;
  const backoffMs = Math.min(15 * 60_000, 60_000 * 2 ** Math.max(0, job.attempts - 1));
  // Store a non-sensitive error code, never raw Odoo/Gmail payloads.
  const candidate = typeof failure?.code === "string" ? failure.code : "";
  const errorCode = /^[A-Z][A-Z0-9_]{0,79}$/.test(candidate) ?
    candidate : "ASYNC_JOB_HANDLER_FAILED";
  const result = await db.query(
    `UPDATE public.async_jobs
     SET status = $3, lease_owner = NULL, lease_token = NULL,
         lease_until = NULL, claimed_at = NULL,
         last_error = $4,
         run_at = CASE WHEN $3 = 'pending'
           THEN (now() AT TIME ZONE 'UTC') +
                ($5::integer * interval '1 millisecond')
           ELSE run_at END,
         updated_at = (now() AT TIME ZONE 'UTC')
     WHERE id = $1 AND lease_token = $2 AND status = 'processing'
     RETURNING id`,
    [job.id, token, exhausted ? "failed" : "pending", errorCode, backoffMs],
  );
  return result.rowCount !== 1 ? "lost_lease" :
    exhausted ? "failed" : "retried";
}

export async function runQueueWorker({
  limit = 5,
  leaseMs = 30_000,
  handlers = defaultHandlers,
  db = pool,
  workerId = randomUUID(),
} = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("ASYNC_JOB_WORKER_LIMIT_INVALID");
  }
  if (!Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 900_000) {
    throw new Error("ASYNC_JOB_LEASE_INVALID");
  }
  if (!db || typeof db.query !== "function" || typeof db.connect !== "function") {
    throw new Error("ASYNC_JOB_POSTGRES_POOL_REQUIRED");
  }
  if (typeof workerId !== "string" || workerId.length < 1 || workerId.length > 128) {
    throw new Error("ASYNC_JOB_WORKER_ID_INVALID");
  }
  if (!handlers || typeof handlers !== "object") {
    throw new Error("ASYNC_JOB_HANDLERS_INVALID");
  }
  const types = Object.keys(handlers);
  if (types.length === 0 || types.some((t) => !JOB_TYPE.test(t) ||
      typeof handlers[t] !== "function")) {
    throw new Error("ASYNC_JOB_HANDLERS_INVALID");
  }

  const result = { claimed: 0, done: 0, retried: 0, failed: 0, lost_lease: 0 };
  await resolveStaleExhausted(db, types);
  for (let i = 0; i < limit; i++) {
    // Claim one job at a time so a batch cannot expire before execution.
    const job = await claimNext(db, types, workerId, leaseMs);
    if (!job) break;
    result.claimed++;
    const outcome = await executeClaimed(db, job, handlers[job.job_type], leaseMs);
    result[outcome]++;
  }
  return result;
}
