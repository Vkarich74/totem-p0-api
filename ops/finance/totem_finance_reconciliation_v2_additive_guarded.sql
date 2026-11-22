\set ON_ERROR_STOP on
\pset pager off
-- TOTEM Finance: additive v2 reconciliation view. Keep legacy view and ACL untouched.
-- Reviewed against live Production catalog on 2026-11-22 (PG17.11, role totem_audit_ro).
-- Never use DROP/CREATE on v_wallet_vs_ledger_diff. No writes to wallets/ledger/payments.
-- Intended to run ONCE on Production PostgreSQL via an authorized operator.
-- At deployment no application consumer is switched to the new name.

BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '1200ms';
SET LOCAL statement_timeout = '20000ms';
SET LOCAL TIME ZONE 'UTC';

DO $preflight$
DECLARE
  v_hash text;
  v_owner text;
  v_columns text;
  v_count integer;
BEGIN
  IF current_database() <> 'railway' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'STOP_WRONG_DATABASE_OR_ACTOR';
  END IF;
  IF to_regclass('totem_test.v_wallet_vs_ledger_diff') IS NULL OR
     to_regclass('totem_test.wallets') IS NULL OR
     to_regclass('totem_test.ledger_entries') IS NULL OR
     to_regclass('totem_test.mv_wallet_balance_snapshot') IS NULL THEN
    RAISE EXCEPTION 'STOP_FINANCE_SOURCE_MISSING';
  END IF;
  IF to_regclass('totem_test.v_wallet_vs_ledger_diff_v2') IS NOT NULL THEN
    RAISE EXCEPTION 'STOP_V2_ALREADY_EXISTS_REVIEW_REQUIRED';
  END IF;
  IF to_regrole('totem_audit_ro') IS NULL THEN
    RAISE EXCEPTION 'STOP_EXPECTED_READONLY_AUDIT_ROLE_MISSING';
  END IF;
  SELECT md5(pg_get_viewdef(c.oid,true)), pg_get_userbyid(c.relowner)
  INTO v_hash, v_owner FROM pg_class c
  WHERE c.oid='totem_test.v_wallet_vs_ledger_diff'::regclass;
  IF v_hash <> '82a081644aae594eaa70d70e289b1d92' OR v_owner <> 'postgres' THEN
    RAISE EXCEPTION 'STOP_LEGACY_VIEW_IDENTITY_CHANGED';
  END IF;
  SELECT string_agg(a.attname || ':' || format_type(a.atttypid,a.atttypmod), ',' ORDER BY a.attnum), count(*)
  INTO v_columns,v_count
  FROM pg_attribute a WHERE a.attrelid='totem_test.v_wallet_vs_ledger_diff'::regclass
    AND a.attnum>0 AND NOT a.attisdropped;
  IF v_count <> 4 OR v_columns <> 'wallet_id:uuid,wallet_balance:integer,ledger_balance:integer,diff:integer' THEN
    RAISE EXCEPTION 'STOP_LEGACY_COLUMNS_CHANGED';
  END IF;
  IF NOT has_schema_privilege('totem_audit_ro','totem_test','USAGE') OR
     NOT has_table_privilege('totem_audit_ro','totem_test.v_wallet_vs_ledger_diff','SELECT') THEN
    RAISE EXCEPTION 'STOP_LEGACY_AUDIT_GRANT_CHANGED';
  END IF;
  SELECT count(*) INTO v_count FROM totem_test.ledger_entries
  WHERE direction IS NULL OR direction NOT IN ('credit','debit') OR amount_cents IS NULL OR amount_cents<=0;
  IF v_count <> 0 THEN RAISE EXCEPTION 'STOP_LEDGER_INVALID_SOURCE_ROWS'; END IF;
  RAISE NOTICE 'FINANCE_V2_PREFLIGHT_PASS legacy=% owner=% columns=4',v_hash,v_owner;
END
$preflight$;

CREATE VIEW totem_test.v_wallet_vs_ledger_diff_v2 AS
WITH canonical AS (
  SELECT w.id AS wallet_id,
    COALESCE(SUM(CASE
      WHEN l.direction='credit' THEN l.amount_cents
      WHEN l.direction='debit' THEN -l.amount_cents
      ELSE 0::bigint
    END),0::numeric) AS ledger_balance
  FROM totem_test.wallets w
  LEFT JOIN totem_test.ledger_entries l ON l.wallet_id=w.id
  GROUP BY w.id
)
SELECT
  w.id AS wallet_id,
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

COMMENT ON VIEW totem_test.v_wallet_vs_ledger_diff_v2 IS
'Additive canonical ledger reconciliation v2. wallet_balance is cached MV, ledger_balance is current; snapshot_status=match/stale/missing. Legacy v_wallet_vs_ledger_diff remains unchanged.';

REVOKE ALL ON totem_test.v_wallet_vs_ledger_diff_v2 FROM PUBLIC;
GRANT SELECT ON totem_test.v_wallet_vs_ledger_diff_v2 TO totem_audit_ro;

DO $postcheck$
DECLARE
  v_wallet_count bigint;
  v_view_count bigint;
  v_invalid bigint;
  v_old_hash text;
  v_new_owner text;
  v_nonapproved_acl bigint;
BEGIN
  SELECT count(*) INTO v_wallet_count FROM totem_test.wallets;
  SELECT count(*) INTO v_view_count FROM totem_test.v_wallet_vs_ledger_diff_v2;
  IF v_view_count<>v_wallet_count THEN RAISE EXCEPTION 'STOP_VIEW_ROW_COUNT_MISMATCH'; END IF;
  SELECT count(*) INTO v_invalid FROM totem_test.v_wallet_vs_ledger_diff_v2 v
  WHERE (v.snapshot_status='match') IS DISTINCT FROM
            (NOT v.snapshot_missing AND v.diff=0)
     OR (v.snapshot_status='missing') IS DISTINCT FROM v.snapshot_missing
     OR (v.snapshot_status='stale') IS DISTINCT FROM
            (NOT v.snapshot_missing AND v.diff<>0)
     OR (v.snapshot_missing AND (v.wallet_balance IS NOT NULL OR v.diff IS NOT NULL))
     OR v.snapshot_status IS NULL;
  IF v_invalid<>0 THEN RAISE EXCEPTION 'STOP_VIEW_STATUS_INVARIANT_FAILED'; END IF;
  SELECT md5(pg_get_viewdef('totem_test.v_wallet_vs_ledger_diff'::regclass,true))
  INTO v_old_hash;
  IF v_old_hash<>'82a081644aae594eaa70d70e289b1d92' OR
     NOT has_table_privilege('totem_audit_ro','totem_test.v_wallet_vs_ledger_diff','SELECT') THEN
    RAISE EXCEPTION 'STOP_LEGACY_VIEW_OR_GRANT_MODIFIED';
  END IF;
  SELECT pg_get_userbyid(relowner) INTO v_new_owner FROM pg_class
  WHERE oid='totem_test.v_wallet_vs_ledger_diff_v2'::regclass;
  IF v_new_owner<>'postgres' OR
     NOT has_table_privilege('totem_audit_ro','totem_test.v_wallet_vs_ledger_diff_v2','SELECT') THEN
    RAISE EXCEPTION 'STOP_V2_OWNER_OR_GRANT_MISMATCH';
  END IF;
  SELECT count(*) INTO v_nonapproved_acl
  FROM pg_class c
  CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
  WHERE c.oid='totem_test.v_wallet_vs_ledger_diff_v2'::regclass
    AND (a.grantee=0 OR pg_get_userbyid(a.grantee) NOT IN ('postgres','totem_audit_ro')
      OR (pg_get_userbyid(a.grantee)='totem_audit_ro' AND a.privilege_type <> 'SELECT'));
  IF v_nonapproved_acl <> 0 THEN RAISE EXCEPTION 'STOP_UNEXPECTED_V2_GRANTS'; END IF;
  RAISE NOTICE 'FINANCE_V2_POSTCHECK_PASS wallets=% view_rows=% invalid=0 legacy_unchanged=YES grants=RESTRICTED',v_wallet_count,v_view_count;
END
$postcheck$;

COMMIT;
-- New-session, read-only verification of all view columns, ACL and existing MV freshness required.
-- Rollback after authorized inspection: DROP VIEW totem_test.v_wallet_vs_ledger_diff_v2 RESTRICT;
