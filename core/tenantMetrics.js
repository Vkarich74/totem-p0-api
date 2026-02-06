// core/tenantMetrics.js (ESM)
// STEP 26.6 — per-tenant metrics (in-memory)

const tenants = new Map();

function getTenantKey(tenantId) {
  return String(tenantId);
}

function ensure(tenantId) {
  const key = getTenantKey(tenantId);
  let t = tenants.get(key);
  if (!t) {
    t = {
      requests_total: 0,
      responses_total: 0,
      errors_total: 0,
      status_2xx: 0,
      status_4xx: 0,
      status_5xx: 0,
      latency_ms_sum: 0,
      latency_ms_count: 0,
      last_seen_at: null
    };
    tenants.set(key, t);
  }
  return t;
}

export function tenantOnRequestStart(tenantId) {
  if (!tenantId) return;
  const t = ensure(tenantId);
  t.requests_total += 1;
  t.last_seen_at = new Date().toISOString();
}

export function tenantOnResponse(tenantId, statusCode, durationMs) {
  if (!tenantId) return;
  const t = ensure(tenantId);
  t.responses_total += 1;

  const sc = Number(statusCode) || 0;
  if (sc >= 200 && sc < 300) t.status_2xx += 1;
  else if (sc >= 400 && sc < 500) t.status_4xx += 1;
  else if (sc >= 500) t.status_5xx += 1;

  const d = Number(durationMs);
  if (Number.isFinite(d) && d >= 0) {
    t.latency_ms_sum += d;
    t.latency_ms_count += 1;
  }
}

export function tenantOnError(tenantId) {
  if (!tenantId) return;
  const t = ensure(tenantId);
  t.errors_total += 1;
}

export function getTenantMetrics({ tenantId } = {}) {
  if (tenantId) {
    const key = getTenantKey(tenantId);
    const t = tenants.get(key);
    if (!t) return null;
    return { tenant_id: key, ...t };
  }

  const out = [];
  for (const [key, t] of tenants.entries()) {
    out.push({ tenant_id: key, ...t });
  }
  return out;
}
