SET search_path TO totem_test;

CREATE OR REPLACE VIEW v_reconciliation_wallet_balance AS
SELECT * FROM v_wallet_vs_ledger_diff WHERE diff <> 0;