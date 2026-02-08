SET search_path TO totem_test;

-- 1) Wallet balance by period (from ledger)
CREATE OR REPLACE VIEW v_report_wallet_period AS
SELECT
  w.id          AS wallet_id,
  w.owner_type,
  w.owner_id,
  date_trunc('day', l.created_at) AS day,
  SUM(
    CASE
      WHEN l.direction = 'credit' THEN l.amount_cents
      WHEN l.direction = 'debit'  THEN -l.amount_cents
      ELSE 0
    END
  ) AS net_amount_cents
FROM wallets w
JOIN ledger_entries l
  ON l.wallet_id = w.id
GROUP BY w.id, w.owner_type, w.owner_id, date_trunc('day', l.created_at);

-- 2) Platform revenue by period (system wallet)
CREATE OR REPLACE VIEW v_report_revenue_period AS
SELECT
  date_trunc('day', l.created_at) AS day,
  SUM(
    CASE
      WHEN l.direction = 'credit' THEN l.amount_cents
      WHEN l.direction = 'debit'  THEN -l.amount_cents
      ELSE 0
    END
  ) AS revenue_cents
FROM ledger_entries l
JOIN wallets w
  ON w.id = l.wallet_id
WHERE w.owner_type = 'system'
GROUP BY date_trunc('day', l.created_at);

-- 3) Invoice ↔ Payout reconciliation (AGGREGATED by system wallet)
CREATE OR REPLACE VIEW v_report_invoice_payout_match AS
WITH invoices AS (
  SELECT
    si.system_wallet AS wallet_id,
    SUM(si.amount_cents) AS invoice_total_cents
  FROM service_invoices si
  GROUP BY si.system_wallet
),
payouts_sum AS (
  SELECT
    p.wallet_id,
    SUM(p.amount_cents) AS payout_total_cents
  FROM payouts p
  WHERE p.status = 'completed'
  GROUP BY p.wallet_id
)
SELECT
  i.wallet_id,
  i.invoice_total_cents,
  COALESCE(ps.payout_total_cents, 0) AS payout_total_cents,
  (COALESCE(ps.payout_total_cents, 0) - i.invoice_total_cents) AS diff_cents
FROM invoices i
LEFT JOIN payouts_sum ps
  ON ps.wallet_id = i.wallet_id;
