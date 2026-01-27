// middleware/logger.js (ESM)
// STEP 24.3 + STEP 26.6 — structured logs + metrics + per-tenant metrics

import {
  metricsOnRequestStart,
  metricsOnResponse,
  metricsOnError
} from "../core/metrics.js";

import {
  tenantOnRequestStart,
  tenantOnResponse,
  tenantOnError
} from "../core/tenantMetrics.js";

function nowMs() {
  return Date.now();
}

function getIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  const ra = req.socket && req.socket.remoteAddress;
  return ra ? String(ra) : "unknown";
}

function getActor(req) {
  const actorType = req.headers["x-actor-type"] ? String(req.headers["x-actor-type"]) : "unknown";
  const actorId =
    req.headers["x-actor-id"] ||
    req.headers["x-user-id"] ||
    req.headers["x-system-id"] ||
    req.headers["x-provider-id"];

  return {
    actor_type: actorType,
    actor_id: actorId ? String(actorId) : "anonymous"
  };
}

function getTenant(req) {
  const t = req.headers["x-tenant-id"];
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function safePath(req) {
  const url = String(req.originalUrl || req.url || "");
  if (url.length <= 512) return url;
  return url.slice(0, 512) + "...";
}

export function accessLogger() {
  return function loggerMiddleware(req, res, next) {
    const t0 = nowMs();

    const tenantId = getTenant(req);

    metricsOnRequestStart();
    tenantOnRequestStart(tenantId);

    if (!req.request_id) {
      const hdr = req.headers["x-request-id"];
      req.request_id = hdr ? String(hdr).slice(0, 64) : `noid-${Math.random().toString(16).slice(2)}`;
    }

    res.on("finish", () => {
      const dt = nowMs() - t0;

      metricsOnResponse(res.statusCode, dt);
      tenantOnResponse(tenantId, res.statusCode, dt);

      const actor = getActor(req);
      const entry = {
        ts: new Date().toISOString(),
        request_id: req.request_id,
        ip: getIp(req),
        method: String(req.method || ""),
        path: safePath(req),
        status: res.statusCode,
        duration_ms: dt,
        actor_type: actor.actor_type,
        actor_id: actor.actor_id,
        tenant_id: tenantId,
        ua: req.headers["user-agent"] ? String(req.headers["user-agent"]).slice(0, 160) : ""
      };

      console.log(JSON.stringify(entry));
    });

    try {
      next();
    } catch (e) {
      metricsOnError();
      tenantOnError(tenantId);
      throw e;
    }
  };
}

export function logError(err, req) {
  try {
    metricsOnError();
    const tenantId = req ? getTenant(req) : null;
    tenantOnError(tenantId);

    const entry = {
      ts: new Date().toISOString(),
      level: "error",
      request_id: req && req.request_id ? req.request_id : "",
      tenant_id: tenantId,
      message: err && err.message ? String(err.message) : "error",
      code: err && err.code ? String(err.code) : "",
      stack: err && err.stack ? String(err.stack).slice(0, 2000) : ""
    };
    console.error(JSON.stringify(entry));
  } catch {
    // ignore
  }
}
