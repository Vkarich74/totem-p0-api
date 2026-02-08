SET search_path TO totem_test;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_wallet_balance_snapshot
AS SELECT * FROM v_wallet_balance_computed;