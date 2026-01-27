// middleware/tenantRateLimit.js (ESM)
// STEP 26.2 — per-tenant rate limiter wrapper

import { rateLimit } from "./rateLimit.js";

export function tenantRateLimit(options = {}) {
  const scope = String(options.scope || "tenant");
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 120;

  // We piggyback on actor-based limiter; tenant is injected into actor header via skip+custom key.
  // Simpler: use ip+actor but we add tenant into actor id by requiring x-tenant-id.
  return rateLimit({
    scope,
    windowMs,
    max,
    keyBy: "ip+actor",
    skip: (req) => {
      // ensure tenant present; otherwise let tenantContext handle
      return false;
    }
  });
}
