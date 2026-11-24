-- G5 T6-G draft, only on approved release after backup and exact QA.
-- Operational control only, NOT billing evidence or another queue.
BEGIN;
CREATE TABLE IF NOT EXISTS public.us_saas_runtime_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 not_before timestamptz NOT NULL DEFAULT '-infinity',
 consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures BETWEEN 0 AND 20),
 last_started_at timestamptz,
 last_finished_at timestamptz,
 last_outcome text NOT NULL DEFAULT 'NEVER' CHECK
 (last_outcome IN ('NEVER','RUNNING','OK','IDLE','PARTIAL','RATE_LIMIT','AUTH_REJECTED','PROVIDER_ERROR','TICK_ERROR')),
 last_metrics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(last_metrics)='object')
);
INSERT INTO public.us_saas_runtime_control(singleton) VALUES(true) ON CONFLICT DO NOTHING;
-- Avoid scanning all historical jobs per tick; no history deletion.
CREATE INDEX IF NOT EXISTS idx_us_saas_reconcile_request_history
 ON public.async_jobs ((payload->>'request_id'),created_at DESC)
 WHERE job_type='us_saas_reconcile';
CREATE INDEX IF NOT EXISTS idx_us_saas_reconcile_outstanding
 ON public.async_jobs ((payload->>'request_id'),status,run_at)
 WHERE job_type='us_saas_reconcile' AND status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_us_saas_reconcile_status_time
 ON public.async_jobs (status,updated_at)
 WHERE job_type='us_saas_reconcile';
COMMIT;
