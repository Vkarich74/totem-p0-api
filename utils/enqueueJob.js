// Existing Core PostgreSQL queue: durable, transaction-compatible enqueue.
import { pool } from "../db/index.js";

const JOB_TYPE = /^[a-z][a-z0-9_]{0,63}$/;

export async function enqueueJob({
  job_type,
  payload,
  run_at = new Date(),
  idempotency_key = null,
  max_attempts = 5,
  dbClient = pool,
} = {}) {
  if (!JOB_TYPE.test(job_type || "")) {
    throw new Error("ASYNC_JOB_TYPE_INVALID");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("ASYNC_JOB_PAYLOAD_INVALID");
  }
  const payloadJson = JSON.stringify(payload);
  if (!payloadJson) throw new Error("ASYNC_JOB_PAYLOAD_NOT_SERIALIZABLE");
  if (!Number.isInteger(max_attempts) || max_attempts < 1 || max_attempts > 20) {
    throw new Error("ASYNC_JOB_MAX_ATTEMPTS_INVALID");
  }
  const time = new Date(run_at);
  if (!Number.isFinite(time.getTime())) throw new Error("ASYNC_JOB_RUN_AT_INVALID");
  if (idempotency_key !== null &&
      (typeof idempotency_key !== "string" ||
       idempotency_key.length < 1 ||
       idempotency_key.length > 512)) {
    throw new Error("ASYNC_JOB_IDEMPOTENCY_KEY_INVALID");
  }
  if (job_type.startsWith("us_") && !idempotency_key) {
    throw new Error("US_ASYNC_JOB_REQUIRES_STABLE_IDEMPOTENCY_KEY");
  }
  if (!dbClient || typeof dbClient.query !== "function") {
    throw new Error("ASYNC_JOB_POSTGRES_CLIENT_REQUIRED");
  }

  // The real UNIQUE arbiter is partial: (job_type, idempotency_key)
  // WHERE idempotency_key IS NOT NULL. Without this WHERE PostgreSQL 42P10.
  // public. prevents test-schema shadowing from the legacy search_path.
  const { rows } = await dbClient.query(
    `INSERT INTO public.async_jobs
       (job_type, payload, run_at, idempotency_key, max_attempts)
     VALUES ($1, $2::jsonb, ($3::timestamptz AT TIME ZONE 'UTC'), $4, $5)
     ON CONFLICT (job_type, idempotency_key)
       WHERE idempotency_key IS NOT NULL
     DO NOTHING
     RETURNING id`,
    [job_type, payloadJson, time.toISOString(), idempotency_key, max_attempts],
  );

  // When called with a dbClient in an existing transaction, enqueue and
  // the canonical Owner Opening state transition commit/rollback together.
  return { enqueued: rows.length === 1, job_id: rows[0]?.id ?? null };
}
