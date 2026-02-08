// reports/report.service.js
// =========================
// Reporting access layer
// =========================

import { pool, sqlite } from "../db/index.js";

/**
 * Refresh materialized views (Postgres only).
 */
export async function refreshReports() {
  if (!pool) {
    // SQLite mode: no materialized views
    return { skipped: true, reason: "SQLITE mode" };
  }

  await pool.query("REFRESH MATERIALIZED VIEW mv_wallet_balances");
  await pool.query("REFRESH MATERIALIZED VIEW mv_ledger_daily_turnover");
  await pool.query("REFRESH MATERIALIZED VIEW mv_platform_fees");

  return { refreshed: true };
}

/**
 * Get wallet balances.
 */
export async function getWalletBalances() {
  if (pool) {
    const res = await pool.query(
      `SELECT * FROM mv_wallet_balances ORDER BY wallet_id`
    );
    return res.rows;
  }

  // SQLite fallback (direct calc)
  const rows = sqlite
    .prepare(`
      SELECT
        w.id AS wallet_id,
        w.owner_type,
        w.owner_id,
        w.currency,
        COALESCE(
          SUM(
            CASE
              WHEN l.direction = 'credit' THEN l.amount_cents
              ELSE -l.amount_cents
            END
          ),
          0
        ) AS balance_cents
      FROM wallets w
      LEFT JOIN ledger_entries l ON l.wallet_id = w.id
      GROUP BY w.id, w.owner_type, w.owner_id, w.currency
      ORDER BY w.id
    `)
    .all();

  return rows;
}
