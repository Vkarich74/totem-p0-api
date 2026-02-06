// utils/enqueueJob.js
import pool from "../db/index.js";

/**
 * Enqueue async job (idempotent)
 */
export async function enqueueJob({
  job_type,
  payload,
  run_at = new Date(),
  idempotency_key = null,
  max_attempts = 5,
}) {
  const q = `
    INSERT INTO async_jobs (job_type, payload, run_at, idempotency_key, max_attempts)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (job_type, idempotency_key)
    DO NOTHING
  `;
  await pool.query(q, [
    job_type,
    payload,
    run_at,
    idempotency_key,
    max_attempts,
  ]);
}
