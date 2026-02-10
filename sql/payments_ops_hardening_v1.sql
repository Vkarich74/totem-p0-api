-- Payments stuck longer than 30 minutes
CREATE OR REPLACE VIEW payments_stuck_v1 AS
SELECT
  id,
  status,
  created_at
FROM payment_intents
WHERE status = 'pending'
  AND created_at < now() - interval '30 minutes';

-- OPS health snapshot
CREATE OR REPLACE VIEW payments_ops_health_v1 AS
SELECT
  status,
  COUNT(*) AS total_count
FROM payment_intents
GROUP BY status;