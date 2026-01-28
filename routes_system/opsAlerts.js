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

const MAX_PENDING_DAYS = 7;

function daysBetween(a, b) {
  return Math.floor(
    Math.abs(new Date(a) - new Date(b)) / (1000 * 60 * 60 * 24)
  );
}

/**
 * B18.2 — OPS / FINANCE ALERTS
 * system-only, read-only
 */
router.get("/system/ops/alerts", (req, res) => {
  try {
    if (req.headers["x-actor-type"] !== "system") {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    if (!db) {
      return res.status(500).json({ error: "DB_NOT_RESOLVED" });
    }

    const alerts = [];
    const now = new Date().toISOString();

    // 1. Pending payouts too long
    const pending = db.prepare(`
      SELECT id, entity_type, entity_id, created_at
      FROM payouts
      WHERE status = 'pending'
    `).all();

    for (const p of pending) {
      const age = daysBetween(p.created_at, now);
      if (age > MAX_PENDING_DAYS) {
        alerts.push({
          type: "PENDING_STALE",
          severity: "warning",
          payout_id: p.id,
          entity_type: p.entity_type,
          entity_id: p.entity_id,
          age_days: age
        });
      }
    }

    // 2. Overpaid / Underpaid / Invalid commission
    const payouts = db.prepare(`
      SELECT
        id,
        total_commission,
        net_amount,
        total_paid
      FROM payouts
    `).all();

    for (const p of payouts) {
      const expected = p.total_commission + p.net_amount;

      if (p.total_commission <= 0) {
        alerts.push({
          type: "ZERO_COMMISSION",
          severity: "critical",
          payout_id: p.id,
          total_commission: p.total_commission
        });
      }

      if (p.total_paid > expected) {
        alerts.push({
          type: "OVERPAID",
          severity: "critical",
          payout_id: p.id,
          expected,
          total_paid: p.total_paid
        });
      }

      if (p.total_paid < expected) {
        alerts.push({
          type: "UNDERPAID",
          severity: "warning",
          payout_id: p.id,
          expected,
          total_paid: p.total_paid
        });
      }
    }

    return res.json({
      ok: true,
      generated_at: now,
      thresholds: {
        MAX_PENDING_DAYS
      },
      total: alerts.length,
      alerts
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
