CREATE VIEW IF NOT EXISTS payments_finance_v1 AS
SELECT
  status,
  COUNT(*) AS total_count,
  SUM(amount) AS total_amount
FROM payment_intents
GROUP BY status;