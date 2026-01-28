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

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * B18.3 — CSV EXPORT (payouts)
 * GET /system/ops/export/payouts?from=YYYY-MM-DD&to=YYYY-MM-DD
 * system-only, read-only
 */
router.get("/system/ops/export/payouts", (req, res) => {
  try {
    if (req.headers["x-actor-type"] !== "system") {
      return res.status(403).json({ error: "FORBIDDEN" });
    }

    if (!db) {
      return res.status(500).json({ error: "DB_NOT_RESOLVED" });
    }

    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        error: "FROM_TO_REQUIRED",
        example: "/system/ops/export/payouts?from=2026-01-01&to=2026-01-31"
      });
    }

    const rows = db.prepare(`
      SELECT
        id,
        entity_type,
        entity_id,
        period_from,
        period_to,
        total_commission,
        net_amount,
        total_paid,
        currency,
        status,
        created_at,
        paid_at
      FROM payouts
      WHERE period_from >= ?
        AND period_to <= ?
      ORDER BY created_at ASC
    `).all(from, to);

    const headers = [
      "id",
      "entity_type",
      "entity_id",
      "period_from",
      "period_to",
      "total_commission",
      "net_amount",
      "total_paid",
      "currency",
      "status",
      "created_at",
      "paid_at"
    ];

    let csv = headers.join(",") + "\n";

    for (const r of rows) {
      const line = headers.map(h => csvEscape(r[h])).join(",");
      csv += line + "\n";
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payouts_${from}_to_${to}.csv"`
    );

    return res.send(csv);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
