-- Payments failure rate
CREATE OR REPLACE VIEW payments_failure_rate_v1 AS
SELECT
  COUNT(*) FILTER (WHERE status = 'failed')::float / NULLIF(COUNT(*),0) AS failure_rate
FROM payment_intents;

-- Payments refund rate
CREATE OR REPLACE VIEW payments_refund_rate_v1 AS
SELECT
  COUNT(*) FILTER (WHERE status = 'refunded')::float / NULLIF(COUNT(*),0) AS refund_rate
FROM payment_intents;

-- Pending longer than SLA
CREATE OR REPLACE VIEW payments_pending_sla_v1 AS
SELECT
  COUNT(*) AS pending_over_sla
FROM payment_intents
WHERE status = 'pending'
  AND created_at < now() - interval '15 minutes';