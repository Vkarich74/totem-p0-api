// middleware/tenant.js
// Canonical tenant middleware — FINAL, COMPATIBLE

const SYSTEM_ALLOW_PREFIXES = [
  "/marketplace/public/",
  "/metrics/",
  "/marketplace/maintenance/",
];

/**
 * Main tenant context middleware (default export)
 */
export default function tenantContext(req, res, next) {
  const actorType = String(req.headers["x-actor-type"] || "").toLowerCase();
  const path = req.path || "";

  // =====================================================
  // SYSTEM ROUTES — NO TENANT REQUIRED
  // =====================================================
  if (actorType === "system") {
    for (const p of SYSTEM_ALLOW_PREFIXES) {
      if (path.startsWith(p)) {
        return next();
      }
    }
  }

  // =====================================================
  // NORMAL TENANT FLOW
  // =====================================================
  const tenantId = req.headers["x-tenant-id"];
  if (!tenantId) {
    return res.status(400).json({ error: "TENANT_REQUIRED" });
  }

  req.tenant = { id: String(tenantId) };
  return next();
}

/**
 * Assert tenant exists (used by reports, metrics, etc.)
 */
export function assertTenantInPath(req, res, next) {
  if (!req.tenant?.id) {
    return res.status(400).json({ error: "TENANT_CONTEXT_REQUIRED" });
  }
  return next();
}

/**
 * Assert tenant match with path param (defensive)
 */
export function assertTenantMatch(req, res, next) {
  const param =
    req.params.tenant_id ||
    req.params.salon_id ||
    req.params.owner_id;

  if (!req.tenant?.id || !param) {
    return res.status(400).json({ error: "TENANT_CONTEXT_REQUIRED" });
  }

  if (String(param) !== String(req.tenant.id)) {
    return res.status(403).json({ error: "CROSS_TENANT_FORBIDDEN" });
  }

  return next();
}
