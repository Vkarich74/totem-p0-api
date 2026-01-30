// middlewares/rateLimitPublic.js
// Public API rate limit (token-aware + IP fallback)
// In-memory Map (per instance). Good enough for now; shared store later (Redis).

const buckets = new Map();

// defaults
const DEFAULT_LIMIT_PER_MIN = 60;
const DEFAULT_BURST = 10; // extra requests allowed above limit within the minute
const DEFAULT_PENALTY_SEC = 60; // block duration after exceed

function nowMs() {
  return Date.now();
}

function getClientIp(req) {
  // trust proxy is enabled in index.js (app.set("trust proxy", 1))
  // Express will set req.ip accordingly.
  return (req.ip || "").toString() || "unknown";
}

function computeResetSec(windowStartMs) {
  const windowMs = 60_000;
  const elapsed = nowMs() - windowStartMs;
  const remaining = Math.ceil((windowMs - elapsed) / 1000);
  return remaining > 0 ? remaining : 0;
}

function getKey(req) {
  // token-first, then IP fallback
  const token = req.publicToken?.token || req.header("X-Public-Token");
  if (token) return `t:${token}`;
  return `ip:${getClientIp(req)}`;
}

function getLimitPerMin(req) {
  // token-aware limit from DB (via publicToken middleware), fallback to default
  const v = req.publicToken?.rate_limit_per_min;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  return DEFAULT_LIMIT_PER_MIN;
}

export function publicRateLimit(req, res, next) {
  try {
    const key = getKey(req);
    const limitPerMin = getLimitPerMin(req);
    const burst = DEFAULT_BURST;
    const penaltySec = DEFAULT_PENALTY_SEC;

    const t = nowMs();
    const windowMs = 60_000;

    let b = buckets.get(key);
    if (!b) {
      b = { windowStart: t, count: 0, blockedUntil: 0 };
      buckets.set(key, b);
    }

    // blocked?
    if (b.blockedUntil && t < b.blockedUntil) {
      const retryAfter = Math.ceil((b.blockedUntil - t) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.setHeader("X-RateLimit-Limit", String(limitPerMin));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(computeResetSec(b.windowStart)));
      return res.status(429).json({ ok: false, error: "TOO_MANY_REQUESTS" });
    }

    // new window?
    if (t - b.windowStart >= windowMs) {
      b.windowStart = t;
      b.count = 0;
      b.blockedUntil = 0;
    }

    b.count += 1;

    const hardLimit = limitPerMin + burst;

    // headers (best-effort)
    const remaining = Math.max(0, hardLimit - b.count);
    res.setHeader("X-RateLimit-Limit", String(limitPerMin));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(computeResetSec(b.windowStart)));

    if (b.count > hardLimit) {
      b.blockedUntil = t + penaltySec * 1000;
      res.setHeader("Retry-After", String(penaltySec));
      return res.status(429).json({ ok: false, error: "TOO_MANY_REQUESTS" });
    }

    return next();
  } catch (err) {
    console.error("publicRateLimit error:", err);
    // never block traffic due to limiter failure
    return next();
  }
}
