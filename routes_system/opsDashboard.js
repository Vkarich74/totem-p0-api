import express from "express";
import * as dbModule from "../db/index.js";

const router = express.Router();

function resolveDb() {
  if (dbModule?.default) return dbModule.default;
  if (dbModule?.db) return dbModule.db;
  if (typeof dbModule?.getDb === "function") return dbModule.getDb();
  if (typeof dbModule?.get_db === "function") return dbModule.get_db();
  return null;
}

const db = resolveDb();

/**
 * B18.1 — OPS / FINANCE DASHBOARD
 * system-only, read-only
 */
router.get("/system/ops/dashboard", (req, res) => {
  try {
    if (req.headers["x-actor-type"] !== "system") {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    if (!db) {
      return res.status(500).json({ error: "DB_NOT_RESOLVED" });
    }

    // Finance aggregates (SOURCE OF TRUTH = payouts)
    const finance = db.prepare(`
      SELECT
        SUM(total_commission + net_amount) AS gmv,
        SUM(total_commission) AS commission,
        SUM(net_amount) AS net_revenue,
        SUM(total_paid) AS total_paid
      FROM payouts
      WHERE status = 'paid'
    `).get();

    // payout status counters
    const payoutStatus = db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM payouts
      GROUP BY status
    `).all();

    // recent payouts
    const recentPayouts = db.prepare(`
      SELECT
        id,
        entity_type,
        entity_id,
        period_from,
        period_to,
        total_paid,
        total_commission,
        net_amount,
        currency,
        status,
        created_at,
        paid_at
      FROM payouts
      ORDER BY created_at DESC
      LIMIT 10
    `).all();

    return res.json({
      ok: true,
      gmv: finance?.gmv || 0,
      commission: finance?.commission || 0,
      net_revenue: finance?.net_revenue || 0,
      total_paid: finance?.total_paid || 0,
      payout_status: payoutStatus,
      recent_payouts: recentPayouts
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
