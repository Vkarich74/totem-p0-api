// routes_marketplace/metricsTenants.js (ESM)
// STEP 26.6 — per-tenant metrics endpoint (system-only)

import { getTenantMetrics } from "../core/tenantMetrics.js";

function assertSystem(req) {
  const actorType = req.headers["x-actor-type"];
  if (actorType !== "system") {
    const e = new Error("Forbidden");
    e.code = "FORBIDDEN_SYSTEM_ONLY";
    throw e;
  }
}

export function registerTenantMetricsRoutes(app) {
  /**
   * GET /metrics/tenants
   * Headers:
   *   x-actor-type: system
   * Query:
   *   tenant_id=1   (optional)
   */
  app.get("/metrics/tenants", (req, res) => {
    try {
      assertSystem(req);

      const tenantId = req.query && req.query.tenant_id
        ? Number(req.query.tenant_id)
        : null;

      const data = getTenantMetrics(
        tenantId ? { tenantId } : {}
      );

      res.json({
        ok: true,
        data
      });
    } catch (err) {
      if (err.code === "FORBIDDEN_SYSTEM_ONLY") {
        return res.status(403).json({ ok: false, error: err.code });
      }
      console.error("[TENANT_METRICS_ERROR]", err);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });
}
