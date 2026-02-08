-- =========================================================
-- TOTEM Reporting — SQL Reports v1 (FREEZE)
-- Target: PostgreSQL (materialized views)
-- =========================================================

BEGIN;

-- -------------------------
-- WALLET BALANCES (MV)
-- -------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_wallet_balances AS
SELECT
  w.id                AS wallet_id,
  w.owner_type,
  w.owner_id,
  w.currency,
  COALESCE(
    SUM(
      CASE
        WHEN l.direction = 'credit' THEN l.amount_cents
        ELSE -l.amount_cents
      END
    ),
    0
  ) AS balance_cents
FROM wallets w
LEFT JOIN ledger_entries l ON l.wallet_id = w.id
GROUP BY w.id, w.owner_type, w.owner_id, w.currency;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_wallet_balances_wallet
  ON mv_wallet_balances(wallet_id);

-- -------------------------
-- LEDGER DAILY TURNOVER
-- -------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ledger_daily_turnover AS
SELECT
  date_trunc('day', created_at) AS day,
  wallet_id,
  SUM(
    CASE WHEN direction = 'credit' THEN amount_cents ELSE 0 END
  ) AS credit_cents,
  SUM(
    CASE WHEN direction = 'debit' THEN amount_cents ELSE 0 END
  ) AS debit_cents
FROM ledger_entries
GROUP BY day, wallet_id;

CREATE INDEX IF NOT EXISTS idx_mv_ledger_daily_turnover_day
  ON mv_ledger_daily_turnover(day);

-- -------------------------
-- PLATFORM FEES (SERVICE INVOICES)
-- -------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_platform_fees AS
SELECT
  date_trunc('day', si.created_at) AS day,
  SUM(si.amount_cents) AS total_fee_cents
FROM service_invoices si
GROUP BY day;

CREATE INDEX IF NOT EXISTS idx_mv_platform_fees_day
  ON mv_platform_fees(day);

COMMIT;
