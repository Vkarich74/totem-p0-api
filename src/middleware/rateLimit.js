// src/middleware/rateLimit.js
// Simple in-memory rate limiter (fixed window) for public endpoints.
// Note: per-instance (Railway multi-replica will have per-replica limits). This is acceptable as a safety baseline.

function nowMs() {
  return Date.now();
}

function clampInt(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function getIp(req) {
  // trust proxy is enabled in app.js; req.ip is derived from X-Forwarded-For safely by Express
  return req.ip || "unknown";
}

export function rateLimit(options = {}) {
  const windowMs = clampInt(Number(options.windowMs ?? 60_000), 1_000, 60 * 60 * 1000);
  const max = clampInt(Number(options.max ?? 60), 1, 100_000);
  const keyPrefix = String(options.keyPrefix ?? "rl");

  const keyFn =
    typeof options.keyFn === "function"
      ? options.keyFn
      : (req) => {
          const ip = getIp(req);
          const slug = req.params?.slug ? String(req.params.slug) : "";
          return `${keyPrefix}:${ip}${slug ? `:${slug}` : ""}`;
        };

  const store = new Map(); // key -> { windowStart:number, count:number }
  const maxKeys = clampInt(Number(options.maxKeys ?? 50_000), 1_000, 500_000);

  function gcIfNeeded() {
    // Best-effort GC to prevent unbounded memory growth.
    if (store.size <= maxKeys) return;

    const cutoff = nowMs() - windowMs * 2; // keep up to 2 windows
    for (const [k, v] of store.entries()) {
      if (v.windowStart < cutoff) store.delete(k);
      if (store.size <= maxKeys) break;
    }

    // If still too big, drop oldest entries.
    if (store.size > maxKeys) {
      const entries = Array.from(store.entries());
      entries.sort((a, b) => a[1].windowStart - b[1].windowStart);
      const toDrop = store.size - maxKeys;
      for (let i = 0; i < toDrop; i++) store.delete(entries[i][0]);
    }
  }

  return function rateLimitMiddleware(req, res, next) {
    try {
      const key = keyFn(req);
      const t = nowMs();

      let rec = store.get(key);
      if (!rec || t - rec.windowStart >= windowMs) {
        rec = { windowStart: t, count: 0 };
        store.set(key, rec);
      }

      rec.count += 1;

      const remaining = Math.max(0, max - rec.count);
      const resetAt = rec.windowStart + windowMs;

      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

      if (rec.count > max) {
        const retryAfterMs = Math.max(0, resetAt - t);
        res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));

        gcIfNeeded();

        return res.status(429).json({
          ok: false,
          error: "RATE_LIMITED",
          request_id: req.request_id ?? null,
          retry_after_ms: retryAfterMs
        });
      }

      gcIfNeeded();
      return next();
    } catch (err) {
      // Fail-open: do not block traffic on limiter errors.
      console.error("RATE_LIMIT_ERROR", err?.message ?? String(err));
      return next();
    }
  };
}