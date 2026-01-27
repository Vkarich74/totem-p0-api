import express from "express";
import { db } from "../db/index.js";

const router = express.Router();

/**
 * SYSTEM — PAYOUTS CSV REPORT
 * GET /system/reports/payouts.csv
 *
 * Headers:
 *  - X-Actor-Type: system
 *  - X-System-Token (if enabled)
 *
 * Query (optional):
 *  - from=YYYY-MM-DD
 *  - to=YYYY-MM-DD
 */
router.get("/reports/payouts.csv", (req, res) => {
  try {
    // SYSTEM GUARD
    if (req.headers["x-actor-type"] !== "system") {
      return res.status(403).json({ error: "forbidden" });
    }

    if (process.env.SYSTEM_TOKEN) {
      if (req.headers["x-system-token"] !== process.env.SYSTEM_TOKEN) {
        return res.status(403).json({ error: "invalid_system_token" });
      }
    }

    const { from, to } = req.query;

    let where = [];
    let params = [];

    if (from) {
      where.push("period_from >= ?");
      params.push(from);
    }

    if (to) {
      where.push("period_to <= ?");
      params.push(to);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const rows = db.prepare(`
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
      ${whereSql}
      ORDER BY id ASC
    `).all(...params);

    // CSV HEADER
    let csv =
      "id,entity_type,entity_id,period_from,period_to,total_paid,total_commission,net_amount,currency,status,created_at,paid_at\n";

    for (const r of rows) {
      csv += [
        r.id,
        r.entity_type,
        r.entity_id,
        r.period_from,
        r.period_to,
        r.total_paid,
        r.total_commission,
        r.net_amount,
        r.currency,
        r.status,
        r.created_at || "",
        r.paid_at || ""
      ].join(",") + "\n";
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=payouts.csv"
    );

    return res.send(csv);
  } catch (e) {
    console.error("SYSTEM_REPORTS_ERROR", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
