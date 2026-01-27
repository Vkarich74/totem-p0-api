// middleware/rateLimit.js (ESM)
// STEP 23.4 + STEP 26.3: in-memory rate limiting (IP + actor [+tenant])

function nowMs() {
  return Date.now();
}

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
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

  const id = actorId ? String(actorId) : "anonymous";

  // ✅ tenant-aware keying when x-tenant-id is present
  const tenant = req.headers["x-tenant-id"] ? String(req.headers["x-tenant-id"]) : "";
  const tenantPart = tenant ? `|tenant:${tenant}` : "";

  return `${actorType}:${id}${tenantPart}`;
}

class BucketStore {
  constructor() {
    this.map = new Map();
    this.lastGc = 0;
  }

  gc(ttlMs) {
    const t = nowMs();
    if (t - this.lastGc < 30_000) return;
    this.lastGc = t;

    for (const [k, v] of this.map.entries()) {
      if (t - v.lastSeen > ttlMs) this.map.delete(k);
    }
  }

  take(key, { capacity, refillPerMs }) {
    const t = nowMs();
    let b = this.map.get(key);
    if (!b) {
      b = { tokens: capacity, last: t, lastSeen: t };
      this.map.set(key, b);
    }

    const dt = Math.max(0, t - b.last);
    const refill = dt * refillPerMs;
    b.tokens = Math.min(capacity, b.tokens + refill);
    b.last = t;
    b.lastSeen = t;

    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { allowed: true, remaining: Math.floor(b.tokens) };
    }
    return { allowed: false, remaining: 0 };
  }
}

const store = new BucketStore();

export function rateLimit(options = {}) {
  const scope = String(options.scope || "global");
  const windowMs = clamp(options.windowMs ?? 60_000, 1_000, 60 * 60_000);
  const max = clamp(options.max ?? 60, 1, 100_000);

  const capacity = max;
  const refillPerMs = max / windowMs;

  const keyBy = String(options.keyBy || "ip+actor");
  const skipFn = typeof options.skip === "function" ? options.skip : null;

  const ttlMs = Math.max(windowMs * 2, 60_000);

  return function rateLimitMiddleware(req, res, next) {
    try {
      if (skipFn && skipFn(req)) return next();

      const ip = getIp(req);
      const actor = getActor(req);

      let key = scope;
      if (keyBy === "ip") key += `|ip:${ip}`;
      else if (keyBy === "actor") key += `|actor:${actor}`;
      else key += `|ip:${ip}|actor:${actor}`;

      store.gc(ttlMs);

      const result = store.take(key, { capacity, refillPerMs });

      res.setHeader("RateLimit-Limit", String(max));
      res.setHeader("RateLimit-Remaining", String(result.remaining));
      res.setHeader("RateLimit-Reset", String(Math.ceil((nowMs() + windowMs) / 1000)));

      if (!result.allowed) {
        res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({
          ok: false,
          error: "RATE_LIMITED",
          scope
        });
      }

      return next();
    } catch (e) {
      return next();
    }
  };
}
