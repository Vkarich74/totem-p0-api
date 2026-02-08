SET search_path TO totem_test;

-- 1) Wallet incidents: anything suspicious in ledger math
CREATE OR REPLACE VIEW v_reconciliation_wallet_incidents AS
SELECT
    l.wallet_id,
    SUM(
        CASE
            WHEN l.direction = 'credit' THEN l.amount_cents
            WHEN l.direction = 'debit'  THEN -l.amount_cents
            ELSE NULL
        END
    ) AS computed_balance_cents,
    COUNT(*)                      AS entries_count,
    SUM(
        CASE
            WHEN l.direction NOT IN ('credit','debit') THEN 1 ELSE 0
        END
    ) AS invalid_direction_count,
    SUM(
        CASE
            WHEN l.amount_cents < 0 THEN 1 ELSE 0
        END
    ) AS negative_amount_count
FROM ledger_entries l
GROUP BY l.wallet_id
HAVING
    -- any invalid direction
    SUM(CASE WHEN l.direction NOT IN ('credit','debit') THEN 1 ELSE 0 END) > 0
 OR -- negative amount stored
    SUM(CASE WHEN l.amount_cents < 0 THEN 1 ELSE 0 END) > 0;

-- 2) High-level summary for audit
CREATE OR REPLACE VIEW v_reconciliation_summary AS
SELECT
    COUNT(*)                           AS wallets_with_incidents,
    SUM(entries_count)                 AS total_entries_checked,
    SUM(invalid_direction_count)       AS invalid_direction_total,
    SUM(negative_amount_count)         AS negative_amount_total
FROM v_reconciliation_wallet_incidents;
