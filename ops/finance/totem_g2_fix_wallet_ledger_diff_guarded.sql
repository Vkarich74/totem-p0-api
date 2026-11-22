\set ON_ERROR_STOP on
\pset pager off
-- TOTEM G2 / Finance core. One-time correction of the legacy reconciliation VIEW.
-- Draft migration. Run only after independent production preflight and approval.
-- No UPDATE/INSERT/DELETE to wallets, ledger_entries or materialized views.
-- The old view has four INTEGER columns, which misrepresent numeric money sums.
-- DROP ... RESTRICT intentionally refuses to remove any dependent object.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '1500ms';
SET LOCAL statement_timeout = '20000ms';
SET LOCAL TIME ZONE 'UTC';
DO $guard$
DECLARE
  current_hash text;
  dependents integer;
  view_owner text;
BEGIN
  IF current_database() <> 'railway' THEN
    RAISE EXCEPTION 'STOP_NOT_RAILWAY_PRODUCTION';
  END IF;
  IF to_regclass('totem_test.v_wallet_vs_ledger_diff') IS NULL
     OR to_regclass('totem_test.mv_wallet_balance_snapshot') IS NULL
     OR to_regclass('totem_test.wallets') IS NULL
     OR to_regclass('totem_test.ledger_entries') IS NULL THEN
    RAISE EXCEPTION 'STOP_FINANCE_CORE_OBJECT_MISSING';
  END IF;
  SELECT md5(pg_get_viewdef('totem_test.v_wallet_vs_ledger_diff'::regclass, true)) INTO current_hash;
  IF current_hash <> '82a081644aae594eaa70d70e289b1d92' THEN
    RAISE EXCEPTION 'STOP_LEGACY_VIEW_DEFINITION_CHANGED';
  END IF;
  SELECT pg_get_userbyid(relowner) INTO view_owner
  FROM pg_class WHERE oid = 'totem_test.v_wallet_vs_ledger_diff'::regclass;
  IF view_owner <> current_user THEN
    RAISE EXCEPTION 'STOP_VIEW_OWNER_NOT_CURRENT_USER';
  END IF;
  SELECT count(*) INTO dependents
  FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid
  JOIN pg_class dependent ON dependent.oid=r.ev_class
  WHERE d.refobjid='totem_test.v_wallet_vs_ledger_diff'::regclass
    AND dependent.oid <> 'totem_test.v_wallet_vs_ledger_diff'::regclass
    AND d.deptype='n';
  IF dependents <> 0 THEN
    RAISE EXCEPTION 'STOP_VIEW_HAS_DEPENDENTS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid='totem_test.v_wallet_vs_ledger_diff'::regclass
      AND a.attnum>0 AND NOT a.attisdropped
    GROUP BY a.attrelid HAVING count(*)<>4
  ) THEN
    RAISE EXCEPTION 'STOP_LEGACY_VIEW_COLUMN_CONTRACT_CHANGED';
  END IF;
  RAISE NOTICE 'G2_VIEW_FIX_PREFLIGHT_PASS legacy_hash=%, dependent_views=0',current_hash;
END
$guard$;
-- Read-lock only; no writes to financial source tables.
LOCK TABLE totem_test.wallets, totem_test.ledger_entries IN SHARE MODE NOWAIT;
DROP VIEW totem_test.v_wallet_vs_ledger_diff RESTRICT;
CREATE VIEW totem_test.v_wallet_vs_ledger_diff AS
WITH canonical AS (
  SELECT w.id AS wallet_id,
         COALESCE(SUM(CASE
           WHEN l.direction='credit' THEN l.amount_cents
           WHEN l.direction='debit'  THEN -l.amount_cents
           ELSE 0::bigint
         END), 0::numeric) AS ledger_balance
  FROM totem_test.wallets w
  LEFT JOIN totem_test.ledger_entries l ON l.wallet_id=w.id
  GROUP BY w.id
)
SELECT w.id AS wallet_id,
       snapshot.balance_cents AS wallet_balance,
       canonical.ledger_balance,
       CASE WHEN snapshot.wallet_id IS NULL THEN NULL::numeric
            ELSE snapshot.balance_cents-canonical.ledger_balance END AS diff,
       (snapshot.wallet_id IS NULL) AS snapshot_missing,
       CASE WHEN snapshot.wallet_id IS NULL THEN 'missing'::text
            WHEN snapshot.balance_cents IS DISTINCT FROM canonical.ledger_balance THEN 'stale'::text
            ELSE 'match'::text END AS snapshot_status,
       snapshot.snapshot_at
FROM totem_test.wallets w
JOIN canonical ON canonical.wallet_id=w.id
LEFT JOIN totem_test.mv_wallet_balance_snapshot snapshot ON snapshot.wallet_id=w.id;
COMMENT ON VIEW totem_test.v_wallet_vs_ledger_diff IS
  'Canonical ledger vs last materialized wallet snapshot. wallet_balance is cached; ledger_balance is current. A NULL diff means snapshot is missing; snapshot_status is match/stale/missing.';
DO $verify$
DECLARE
  wallets_count bigint;
  result_rows bigint;
  incorrect_rows bigint;
  missing_rows bigint;
  stale_rows bigint;
BEGIN
  SELECT count(*) INTO wallets_count FROM totem_test.wallets;
  SELECT count(*),
         count(*) FILTER(WHERE snapshot_status='missing'),
         count(*) FILTER(WHERE snapshot_status='stale')
    INTO result_rows, missing_rows, stale_rows
  FROM totem_test.v_wallet_vs_ledger_diff;
  IF wallets_count <> result_rows THEN
    RAISE EXCEPTION 'STOP_RECON_VIEW_CARDINALITY';
  END IF;
  SELECT count(*) INTO incorrect_rows
  FROM totem_test.v_wallet_vs_ledger_diff v
  WHERE (v.snapshot_status='match') IS DISTINCT FROM
            (NOT v.snapshot_missing AND v.diff=0)
     OR (v.snapshot_status='missing') IS DISTINCT FROM v.snapshot_missing
     OR (v.snapshot_status='stale') IS DISTINCT FROM
            (NOT v.snapshot_missing AND v.diff<>0)
     OR (v.snapshot_missing AND (v.wallet_balance IS NOT NULL OR v.diff IS NOT NULL))
     OR v.snapshot_status IS NULL;
  IF incorrect_rows <> 0 THEN
    RAISE EXCEPTION 'STOP_RECON_VIEW_BAD_STATUS count=%',incorrect_rows;
  END IF;
  RAISE NOTICE 'G2_VIEW_FIX_POSTCHECK_PASS wallets=% missing=% stale=% incorrect=0',wallets_count,missing_rows,stale_rows;
END
$verify$;
COMMIT;
-- Only a real COMMIT and a new-session read constitute production confirmation.
