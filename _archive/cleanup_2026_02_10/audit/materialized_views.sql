SET search_path TO totem_test;

-- Snapshot of wallet balances (cents)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_wallet_balance_snapshot AS
SELECT
  w.id          AS wallet_id,
  w.owner_type,
  w.owner_id,
  COALESCE(SUM(
    CASE
      WHEN l.direction = 'credit' THEN l.amount_cents
      WHEN l.direction = 'debit'  THEN -l.amount_cents
      ELSE 0
    END
  ), 0) AS balance_cents,
  now() AS snapshot_at
FROM wallets w
LEFT JOIN ledger_entries l
  ON l.wallet_id = w.id
GROUP BY w.id, w.owner_type, w.owner_id;

-- Daily ledger summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ledger_daily_summary AS
SELECT
  date(l.created_at) AS day,
  l.wallet_id,
  SUM(
    CASE
      WHEN l.direction = 'credit' THEN l.amount_cents
      WHEN l.direction = 'debit'  THEN -l.amount_cents
      ELSE 0
    END
  ) AS net_amount_cents
FROM ledger_entries l
GROUP BY date(l.created_at), l.wallet_id;
