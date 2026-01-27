// jobs/autoSettlement.js (ESM)
// Auto-settlement cron with dry-run and execute modes

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

import { getSettlementRule, assertPeriodMature, assertRefundPolicy } from "../core/settlement.js";
import { createPayout } from "../core/payouts.js";
import { getSalonReport, getMasterReport } from "../core/reports.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "..", "totem.db");

function todayUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Find candidate periods to settle.
 * Strategy (simple & safe for P1):
 * - Group bookings by entity (salon/master) and calendar month
 * - Only periods that already ended (period_to < today)
 */
function findCandidatePeriods(db, entityType) {
  const today = todayUTC();

  const rows = db.prepare(`
    SELECT
      b.${entityType}_id AS entity_id,
      substr(b.date, 1, 7) AS ym -- YYYY-MM
    FROM bookings b
    WHERE b.${entityType}_id IS NOT NULL
      AND b.date < ?
    GROUP BY b.${entityType}_id, ym
  `).all(today);

  return rows.map(r => {
    const from = `${r.ym}-01`;
    const to = endOfMonth(r.ym);
    return { entity_type: entityType, entity_id: String(r.entity_id), from, to };
  });
}

function endOfMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)); // last day of month
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

function payoutExists(db, entityType, entityId, from, to) {
  return db.prepare(`
    SELECT 1 FROM payouts
    WHERE entity_type = ?
      AND entity_id = ?
      AND period_from = ?
      AND period_to = ?
  `).get(entityType, entityId, from, to);
}

/**
 * AUTO SETTLEMENT
 * @param {Object} opts
 * @param {boolean} opts.execute - false = dry-run, true = create payouts
 */
export function runAutoSettlement({ execute = false } = {}) {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const results = {
    execute,
    today: todayUTC(),
    candidates: [],
    created: [],
    skipped: []
  };

  try {
    const candidates = [
      ...findCandidatePeriods(db, "salon"),
      ...findCandidatePeriods(db, "master")
    ];

    for (const c of candidates) {
      const { entity_type, entity_id, from, to } = c;

      // Skip if payout already exists
      if (payoutExists(db, entity_type, entity_id, from, to)) {
        results.skipped.push({ ...c, reason: "PAYOUT_ALREADY_EXISTS" });
        continue;
      }

      // Settlement rules
      const rule = getSettlementRule(db, entity_type, entity_id);

      try {
        assertPeriodMature(rule, from, to);
        assertRefundPolicy(rule);
      } catch (e) {
        results.skipped.push({ ...c, reason: e.code || "SETTLEMENT_BLOCKED" });
        continue;
      }

      // Preview (for dry-run visibility)
      const report =
        entity_type === "salon"
          ? getSalonReport(db, entity_id, { from, to })
          : getMasterReport(db, entity_id, { from, to });

      results.candidates.push({
        ...c,
        totals: {
          total_paid: report.total_paid,
          total_commission: report.total_commission,
          net_amount: report.net_to_salon,
          currency: report.currency
        }
      });

      if (execute) {
        const created = createPayout(db, entity_type, entity_id, { from, to });
        results.created.push(created);
      }
    }

    return results;

  } finally {
    db.close();
  }
}

// CLI usage
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const execute = process.argv.includes("--execute");
  const out = runAutoSettlement({ execute });
  console.log(JSON.stringify(out, null, 2));
}
