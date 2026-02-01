-- migrations/create_async_queue_v1.sql
BEGIN;

CREATE TABLE IF NOT EXISTS async_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  run_at TIMESTAMP NOT NULL DEFAULT now(),
  last_error TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_async_jobs_pending
  ON async_jobs (status, run_at);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_async_jobs_idem
  ON async_jobs (job_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMIT;
