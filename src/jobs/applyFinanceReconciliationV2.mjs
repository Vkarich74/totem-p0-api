// One-shot Railway pre-deploy operator for the already-audited additive finance reconciliation v2.
// No HTTP route, no background scheduler, no startup hook, no changes to the 4-column legacy view.
// Must never run without an explicit, one-time feature approval.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pool } from "../db.js";

const FLAG = "FINANCE_RECON_V2_MIGRATION_APPROVED";
const EXPECTED_SHA256 = "B9706987BA3F3A3A9B5D0E9D76E3DCD3BF2946650CE82BCB428D74837F349CD0";
const LEGACY_VIEW_MD5 = "82a081644aae594eaa70d70e289b1d92";
const SQL_PATH = new URL("../../ops/finance/totem_finance_reconciliation_v2_additive_guarded.sql", import.meta.url);

const requirePass = (condition, code) => {
  if (!condition) throw new Error(code);
};

async function install() {
  requirePass(String(process.env[FLAG] || "").toLowerCase() === "true", "STOP_FINANCE_V2_FLAG_OFF");
  requirePass(Boolean(process.env.DATABASE_URL), "STOP_DATABASE_URL_NOT_CONFIGURED");

  const source = readFileSync(SQL_PATH, "utf8");
  const sha = createHash("sha256").update(source, "utf8").digest("hex").toUpperCase();
  requirePass(sha === EXPECTED_SHA256, "STOP_MIGRATION_SQL_HASH_CHANGED");
  requirePass(source.includes("CREATE VIEW totem_test.v_wallet_vs_ledger_diff_v2 AS"), "STOP_MIGRATION_SOURCE_MISMATCH");
  requirePass(!source.includes("DROP VIEW totem_test.v_wallet_vs_ledger_diff;"), "STOP_DESTRUCTIVE_LEGACY_SQL");

  // psql-specific display directives are stripped; the SQL statements run unmodified.
  const sql = source.split(/\r?\n/).filter((line) => !line.trimStart().startsWith("\\")).join("\n");

  const client = await pool.connect();
  let committed = false;
  try {
    // Server executes the complete guarded BEGIN ... COMMIT atomically.
    // Any SQL preflight or postcheck exception aborts the transaction.
    await client.query(sql);
    committed = true;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) { /* connection may be down */ }
    throw new Error("FINANCE_V2_SQL_ABORTED_" + (error?.code || error?.message || "UNKNOWN"));
  } finally {
    client.release();
  }
  requirePass(committed, "STOP_FINANCE_V2_COMMIT_UNCONFIRMED");

  // New connection + new read-only transaction: do not trust the install connection.
  const verifier = await pool.connect();
  try {
    await verifier.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await verifier.query(`
      SELECT current_database() AS db, current_setting('transaction_read_only') AS read_only,
        md5(pg_get_viewdef('totem_test.v_wallet_vs_ledger_diff'::regclass,true)) AS legacy_hash,
        pg_get_userbyid(c.relowner) AS new_owner,
        has_table_privilege('totem_audit_ro','totem_test.v_wallet_vs_ledger_diff','SELECT') AS legacy_audit_grant,
        has_table_privilege('totem_audit_ro','totem_test.v_wallet_vs_ledger_diff_v2','SELECT') AS v2_audit_grant,
        (SELECT count(*)::int FROM totem_test.wallets) AS wallets,
        (SELECT count(*)::int FROM totem_test.v_wallet_vs_ledger_diff_v2) AS v2_rows,
        (SELECT count(*)::int FROM totem_test.v_wallet_vs_ledger_diff_v2 v WHERE
          (v.snapshot_status='match') IS DISTINCT FROM
            (NOT v.snapshot_missing AND v.diff=0)
          OR (v.snapshot_status='missing') IS DISTINCT FROM v.snapshot_missing
          OR (v.snapshot_status='stale') IS DISTINCT FROM
            (NOT v.snapshot_missing AND v.diff<>0)
          OR v.snapshot_status IS NULL) AS bad_rows
      FROM pg_class c WHERE c.oid='totem_test.v_wallet_vs_ledger_diff_v2'::regclass
    `);
    requirePass(result.rowCount === 1, "STOP_FINANCE_V2_VERIFY_ROW_COUNT");
    const r = result.rows[0];
    requirePass(r.db === "railway" && r.read_only === "on", "STOP_FINANCE_V2_VERIFY_DATABASE");
    requirePass(r.legacy_hash === LEGACY_VIEW_MD5 && r.new_owner === "postgres", "STOP_FINANCE_V2_VERIFY_CONTRACT");
    requirePass(r.legacy_audit_grant === true && r.v2_audit_grant === true, "STOP_FINANCE_V2_VERIFY_PRIVILEGES");
    requirePass(r.wallets === r.v2_rows && r.bad_rows === 0, "STOP_FINANCE_V2_VERIFY_VALUES");
    await verifier.query("ROLLBACK");
    console.log("FINANCE_V2_PRODUCTION_PASS", "view_rows=" + r.v2_rows, "wallets=" + r.wallets,
      "bad_status_rows=0", "legacy_unchanged=true", "audit_role_preserved=true");
  } catch (error) {
    try { await verifier.query("ROLLBACK"); } catch (_) { /* connection may be down */ }
    throw error;
  } finally {
    verifier.release();
  }
}

try {
  await install();
} catch (error) {
  console.error("FINANCE_V2_PREDEPLOY_FAILED", error?.message || "UNKNOWN");
  process.exitCode = 1;
} finally {
  await pool.end();
}
