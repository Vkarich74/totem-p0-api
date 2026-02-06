// routes_marketplace/maintenance.js (ESM)
// STEP 25 — maintenance endpoints (system-only)

import { runRetention } from "../core/retention.js";

function assertSystem(req) {
  const actorType = req.headers["x-actor-type"];
  if (actorType !== "system") {
    const e = new Error("Forbidden");
    e.code = "FORBIDDEN_SYSTEM_ONLY";
    throw e;
  }
}

export function registerMaintenanceRoutes(app, db) {

  /**
   * POST /marketplace/maintenance/cleanup
   * Headers:
   *   x-actor-type: system
   *   x-auth-token: <system token>  (enforced by abuseGuard)
   * Body (optional):
   *   { auditRetentionDays: 30 }
   */
  app.post("/marketplace/maintenance/cleanup", (req, res) => {
    try {
      assertSystem(req);

      const auditRetentionDays =
        req.body && req.body.auditRetentionDays !== undefined
          ? Number(req.body.auditRetentionDays)
          : Number(process.env.AUDIT_RETENTION_DAYS || 0);

      const result = runRetention(db, { auditRetentionDays });

      res.json({
        ok: true,
        result
      });
    } catch (err) {
      const code = err.code || "MAINTENANCE_ERROR";
      if (code === "FORBIDDEN_SYSTEM_ONLY") {
        return res.status(403).json({ ok: false, error: code });
      }
      console.error("[MAINTENANCE_ERROR]", err);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });
}
