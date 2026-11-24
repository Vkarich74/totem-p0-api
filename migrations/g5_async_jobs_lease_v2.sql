-- Existing public.async_jobs queue: additive lease metadata only.
-- Run solely on an approved release after backup + isolated integration QA.
-- Do NOT rewrite migrations/create_async_queue_v1.sql.
BEGIN;

ALTER TABLE public.async_jobs
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_token UUID,
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_async_jobs_processing_lease
  ON public.async_jobs (lease_until, id)
  WHERE status = 'processing';

COMMIT;
