\set ON_ERROR_STOP on
\pset pager off
\pset format unaligned
\pset tuples_only on
-- TOTEM G2 Finance Core. SINGLE-TRANSACTION in-place refresh.
-- Invoke only from an approved PostgreSQL administrative channel.
-- This script DOES NOT edit ledger, wallets, payments or materialized-view definitions.
-- Fail fast on concurrent finance writes/readers: NOWAIT locks; no partial commit.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL lock_timeout='1000ms';
SET LOCAL statement_timeout='15000ms';
SET LOCAL idle_in_transaction_session_timeout='20000ms';
SET LOCAL application_name='totem_g2_finance_mv_guarded_20261122';
-- Lock base source BEFORE taking a repeatable-read snapshot. This prevents concurrent
-- finance ledger/wallet writes while deriving and checking both materializations.
LOCK TABLE totem_test.ledger_entries, totem_test.wallets IN SHARE MODE NOWAIT;
-- PostgreSQL REFRESH obtains an internal AccessExclusiveLock on each materialized view.
-- Explicit LOCK TABLE against a materialized view is unsupported by PostgreSQL.
-- The 1-second lock_timeout aborts instead of waiting on report readers.
-- No CONCURRENTLY: a qualifying all-rows unique index has not been established.
DO $preflight$
DECLARE
  v_ledger_count bigint;
  v_wallet_count bigint;
  v_bad bigint;
  v_global_net numeric;
BEGIN
  IF current_database() <> 'railway' THEN
    RAISE EXCEPTION 'STOP_WRONG_TARGET_DB: %',current_database();
  END IF;
  IF current_setting('transaction_read_only') <> 'off' OR current_setting('TimeZone') <> 'UTC' THEN
    RAISE EXCEPTION 'STOP_WRONG_TRANSACTION_CONTRACT';
  END IF;
  IF md5(pg_get_viewdef('totem_test.mv_ledger_daily_summary'::regclass,true)) <> '3546f0c1dcc97458f1bf428c5d4350b0'
     OR md5(pg_get_viewdef('totem_test.mv_wallet_balance_snapshot'::regclass,true)) <> '2690878cdb93941b8e8520791907ad77' THEN
    RAISE EXCEPTION 'STOP_FINANCE_MV_DEFINITION_DRIFT';
  END IF;
  SELECT count(*) INTO v_ledger_count FROM totem_test.ledger_entries;
  SELECT count(*) INTO v_wallet_count FROM totem_test.wallets;
  IF v_ledger_count < 100 OR v_wallet_count < 6 THEN
    RAISE EXCEPTION 'STOP_FINANCE_BASELINE_SHRANK ledger=% wallets=%',v_ledger_count,v_wallet_count;
  END IF;
  SELECT count(*) INTO v_bad
  FROM totem_test.ledger_entries l LEFT JOIN totem_test.wallets w ON w.id=l.wallet_id
  WHERE l.direction NOT IN ('credit','debit') OR l.amount_cents<=0 OR w.id IS NULL;
  IF v_bad<>0 THEN RAISE EXCEPTION 'STOP_LEDGER_BASIC_INVALID=%',v_bad; END IF;
  SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amount_cents ELSE -amount_cents END),0)
    INTO v_global_net FROM totem_test.ledger_entries;
  IF v_global_net<>0 THEN RAISE EXCEPTION 'STOP_LEDGER_GLOBAL_NET=%',v_global_net; END IF;
  WITH refs AS (
    SELECT reference_type,reference_id,count(*) AS n,
     count(*) FILTER(WHERE direction='credit') AS credits,
     count(*) FILTER(WHERE direction='debit') AS debits,
     count(DISTINCT wallet_id) AS wallets,
     min(amount_cents) AS amount_min,max(amount_cents) AS amount_max,
     SUM(CASE WHEN direction='credit' THEN amount_cents ELSE -amount_cents END) AS net
    FROM totem_test.ledger_entries GROUP BY reference_type,reference_id
  )
  SELECT count(*) INTO v_bad FROM refs
  WHERE reference_type IN('payment','payout','refund_reverse')
    AND (n<>2 OR credits<>1 OR debits<>1 OR wallets<>2 OR amount_min<>amount_max OR net<>0);
  IF v_bad<>0 THEN RAISE EXCEPTION 'STOP_LEDGER_DOUBLE_ENTRY_INVALID=%',v_bad; END IF;
  RAISE NOTICE 'G2_PREFLIGHT_PASS ledger=% wallets=% global_net=0 UTC',v_ledger_count,v_wallet_count;
END;
$preflight$;
SELECT 'G2_BEFORE|ledger_mv='||(SELECT count(*) FROM totem_test.mv_ledger_daily_summary)
  ||'|wallet_mv='||(SELECT count(*) FROM totem_test.mv_wallet_balance_snapshot)
  ||'|ledger='||(SELECT count(*) FROM totem_test.ledger_entries)
  ||'|wallets='||(SELECT count(*) FROM totem_test.wallets);
REFRESH MATERIALIZED VIEW totem_test.mv_ledger_daily_summary;
REFRESH MATERIALIZED VIEW totem_test.mv_wallet_balance_snapshot;
DO $validate$
DECLARE
  v_diff bigint;
  v_stale bigint;
  v_ledger_count bigint;
  v_wallet_count bigint;
BEGIN
  SELECT count(*) INTO v_diff FROM (
    (SELECT day,wallet_id,net_amount_cents FROM totem_test.mv_ledger_daily_summary
      EXCEPT ALL
     SELECT (created_at AT TIME ZONE 'UTC')::date,wallet_id,
       SUM(CASE WHEN direction='credit' THEN amount_cents WHEN direction='debit' THEN -amount_cents ELSE 0::bigint END)
      FROM totem_test.ledger_entries GROUP BY 1,2)
    UNION ALL
    (SELECT (created_at AT TIME ZONE 'UTC')::date,wallet_id,
       SUM(CASE WHEN direction='credit' THEN amount_cents WHEN direction='debit' THEN -amount_cents ELSE 0::bigint END)
      FROM totem_test.ledger_entries GROUP BY 1,2
      EXCEPT ALL SELECT day,wallet_id,net_amount_cents FROM totem_test.mv_ledger_daily_summary)
  ) diff;
  IF v_diff<>0 THEN RAISE EXCEPTION 'STOP_LEDGER_MV_MISMATCH rows=%',v_diff; END IF;
  WITH expected AS (
    SELECT w.id AS wallet_id,w.owner_type,w.owner_id,
      COALESCE(SUM(CASE WHEN l.direction='credit' THEN l.amount_cents WHEN l.direction='debit' THEN -l.amount_cents ELSE 0::bigint END),0::numeric) AS balance_cents
    FROM totem_test.wallets w LEFT JOIN totem_test.ledger_entries l ON l.wallet_id=w.id
    GROUP BY w.id,w.owner_type,w.owner_id
  )
  SELECT count(*) INTO v_diff FROM (
    (SELECT wallet_id,owner_type,owner_id,balance_cents FROM totem_test.mv_wallet_balance_snapshot
      EXCEPT ALL SELECT wallet_id,owner_type,owner_id,balance_cents FROM expected)
    UNION ALL
    (SELECT wallet_id,owner_type,owner_id,balance_cents FROM expected
      EXCEPT ALL SELECT wallet_id,owner_type,owner_id,balance_cents FROM totem_test.mv_wallet_balance_snapshot)
  ) diff;
  IF v_diff<>0 THEN RAISE EXCEPTION 'STOP_WALLET_MV_MISMATCH rows=%',v_diff; END IF;
  SELECT count(*) INTO v_stale FROM totem_test.mv_wallet_balance_snapshot
    WHERE snapshot_at IS DISTINCT FROM transaction_timestamp();
  IF v_stale<>0 THEN RAISE EXCEPTION 'STOP_WALLET_SNAPSHOT_NOT_CURRENT=%',v_stale; END IF;
  SELECT count(*) INTO v_ledger_count FROM totem_test.mv_ledger_daily_summary;
  SELECT count(*) INTO v_wallet_count FROM totem_test.mv_wallet_balance_snapshot;
  IF v_wallet_count <> (SELECT count(*) FROM totem_test.wallets) THEN
    RAISE EXCEPTION 'STOP_WALLET_MV_COUNT_DIFFERENT';
  END IF;
  RAISE NOTICE 'G2_POSTCHECK_PASS ledger_mv_rows=% wallet_mv_rows=% zero_diffs=YES',v_ledger_count,v_wallet_count;
END;
$validate$;
SELECT 'G2_AFTER|ledger_mv='||(SELECT count(*) FROM totem_test.mv_ledger_daily_summary)
  ||'|wallet_mv='||(SELECT count(*) FROM totem_test.mv_wallet_balance_snapshot)
  ||'|ledger='||(SELECT count(*) FROM totem_test.ledger_entries)
  ||'|wallets='||(SELECT count(*) FROM totem_test.wallets)
  ||'|snapshot_at='||(SELECT min(snapshot_at)::text FROM totem_test.mv_wallet_balance_snapshot);
COMMIT;
-- Only an actual COMMIT followed by connection exit 0 constitutes Production PASS.
