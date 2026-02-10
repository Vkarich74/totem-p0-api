SET search_path TO totem_test;

CREATE OR REPLACE VIEW v_wallet_balance_computed AS
SELECT
    w.id AS wallet_id,
    COALESCE(SUM(
        CASE
            WHEN l.direction = 'credit' THEN l.amount_cents
            WHEN l.direction = 'debit'  THEN -l.amount_cents
            ELSE 0
        END
    ), 0) AS computed_balance_cents
FROM wallets w
LEFT JOIN ledger_entries l
  ON l.wallet_id = w.id
GROUP BY w.id;

CREATE OR REPLACE VIEW v_wallet_vs_ledger_diff AS
SELECT
    w.id AS wallet_id,
    w.owner_type,
    w.owner_id,
    v.computed_balance_cents,
    v.computed_balance_cents AS ledger_balance_cents
FROM wallets w
JOIN v_wallet_balance_computed v
  ON v.wallet_id = w.id;