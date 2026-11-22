// TOTEM G2 Finance Core: bounded, single-writer, conditional materialized-view maintenance.
// Disabled by default. Does not modify ledger_entries, wallets, payments, or payout records.
// Works only with the two proven totem_test materialized view definitions.

const ORIGINAL_LEDGER_MV_DEF = "3546f0c1dcc97458f1bf428c5d4350b0";
const ORIGINAL_WALLET_MV_DEF = "2690878cdb93941b8e8520791907ad77";

const divergenceSQL = `
WITH expected_daily AS (
  SELECT (l.created_at AT TIME ZONE 'UTC')::date AS day, l.wallet_id,
    SUM(CASE WHEN l.direction='credit' THEN l.amount_cents
             WHEN l.direction='debit' THEN -l.amount_cents ELSE 0::bigint END) AS net_amount_cents
  FROM totem_test.ledger_entries l GROUP BY 1,2
), daily_diff AS (
  (SELECT day,wallet_id,net_amount_cents FROM expected_daily
   EXCEPT ALL SELECT day,wallet_id,net_amount_cents FROM totem_test.mv_ledger_daily_summary)
  UNION ALL
  (SELECT day,wallet_id,net_amount_cents FROM totem_test.mv_ledger_daily_summary
   EXCEPT ALL SELECT day,wallet_id,net_amount_cents FROM expected_daily)
), expected_wallet AS (
  SELECT w.id AS wallet_id,w.owner_type,w.owner_id,
    COALESCE(SUM(CASE WHEN l.direction='credit' THEN l.amount_cents
                      WHEN l.direction='debit' THEN -l.amount_cents ELSE 0::bigint END), 0::numeric)
      AS balance_cents
  FROM totem_test.wallets w
  LEFT JOIN totem_test.ledger_entries l ON l.wallet_id=w.id
  GROUP BY w.id,w.owner_type,w.owner_id
), wallet_diff AS (
  (SELECT wallet_id,owner_type,owner_id,balance_cents FROM expected_wallet
   EXCEPT ALL SELECT wallet_id,owner_type,owner_id,balance_cents
              FROM totem_test.mv_wallet_balance_snapshot)
  UNION ALL
  (SELECT wallet_id,owner_type,owner_id,balance_cents
   FROM totem_test.mv_wallet_balance_snapshot
   EXCEPT ALL SELECT wallet_id,owner_type,owner_id,balance_cents FROM expected_wallet)
)
SELECT
  (SELECT count(*)::int FROM daily_diff) AS daily_differences,
  (SELECT count(*)::int FROM wallet_diff) AS wallet_differences,
  (SELECT count(*)::int FROM totem_test.ledger_entries
    WHERE amount_cents<=0 OR direction NOT IN ('credit','debit') OR direction IS NULL)
    AS invalid_ledger_entries,
  (SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amount_cents
                            WHEN direction='debit' THEN -amount_cents
                            ELSE 0::bigint END), 0::numeric)
     FROM totem_test.ledger_entries) AS ledger_net,
  (SELECT count(*)::int FROM totem_test.ledger_entries) AS ledger_rows,
  (SELECT count(*)::int FROM totem_test.wallets) AS wallet_rows
`;

/**
 * Refresh only if source-ledger values differ from the two cached views.
 * The advisory transaction lock coordinates multiple API replicas.
 * READ COMMITTED plus SHARE NOWAIT locks ensure checks and REFRESH see
 * committed source data without racing finance writes.
 *
 * A failure rolls back both refreshes. No retries and no source-table writes.
 */
export async function refreshFinanceMaterializedViewsOnce(pool) {
  if (!pool || typeof pool.connect !== "function") {
    throw new Error("FINANCE_MV_POOL_REQUIRED");
  }
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    inTransaction = true;
    await client.query("SET LOCAL lock_timeout = '1000ms'");
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query("SET LOCAL application_name = 'TOTEM_G2_FINANCE_MV_REFRESH'");

    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock(770222, 2) AS locked"
    );
    if (lock.rows[0]?.locked !== true) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return { status: "skipped_other_instance" };
    }

    // Never silently refresh unexpected definitions following a DB migration.
    const { rows: definitions } = await client.query(`
      SELECT c.relname, md5(pg_get_viewdef(c.oid,true)) AS defhash
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='totem_test' AND c.relkind='m'
        AND c.relname IN ('mv_ledger_daily_summary','mv_wallet_balance_snapshot')
    `);
    const found = Object.fromEntries(definitions.map((r) => [r.relname, r.defhash]));
    if (found.mv_ledger_daily_summary !== ORIGINAL_LEDGER_MV_DEF ||
        found.mv_wallet_balance_snapshot !== ORIGINAL_WALLET_MV_DEF ||
        definitions.length !== 2) {
      throw new Error("FINANCE_MV_DEFINITION_CHANGED_REVIEW_REQUIRED");
    }

    // One short source write-lock. If a payment is in progress, exit safely.
    await client.query(
      "LOCK TABLE totem_test.wallets, totem_test.ledger_entries IN SHARE MODE NOWAIT"
    );
    const before = (await client.query(divergenceSQL)).rows[0];
    if (before.invalid_ledger_entries !== 0 || String(before.ledger_net) !== "0") {
      throw new Error("FINANCE_LEDGER_INVARIANT_FAILED");
    }
    if (before.daily_differences === 0 && before.wallet_differences === 0) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return { status: "already_current", ledger: before.ledger_rows,
               wallets: before.wallet_rows };
    }

    // Standard non-concurrent REFRESH: no unique MV indexes exist. It locks
    // readers briefly; lock_timeout prevents prolonged production disruption.
    await client.query("REFRESH MATERIALIZED VIEW totem_test.mv_ledger_daily_summary");
    await client.query("REFRESH MATERIALIZED VIEW totem_test.mv_wallet_balance_snapshot");
    const after = (await client.query(divergenceSQL)).rows[0];
    if (after.daily_differences !== 0 || after.wallet_differences !== 0 ||
        after.invalid_ledger_entries !== 0 || String(after.ledger_net) !== "0" ||
        after.wallet_rows !== before.wallet_rows || after.ledger_rows !== before.ledger_rows) {
      throw new Error("FINANCE_MV_POSTCHECK_FAILED");
    }
    await client.query("COMMIT");
    inTransaction = false;
    return { status: "refreshed", ledger: after.ledger_rows,
             wallets: after.wallet_rows };
  } catch (error) {
    if (inTransaction) {
      try { await client.query("ROLLBACK"); } catch (_) { /* connection reset */ }
    }
    if (error?.code === "55P03") return { status: "skipped_lock_busy" };
    throw error;
  } finally {
    client.release();
  }
}
