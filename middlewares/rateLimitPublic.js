// middlewares/rateLimitPublic.js
// Public API rate limit — CANONICAL v1
// Strategy: token-first, IP fallback
// Window: 60 seconds (fixed)
// Storage: in-memory (per instance)

const buckets = new Map();

// v1 constants (documented)
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT_PER_MIN = 60;
const DEFAULT_BURST = 10;          // soft burst over limit
const DEFAULT_PENALTY_SEC = 60;    // block duration after exceed

function nowMs() {
  return Date.now();
}

function getClientIp(req) {
  return (req.ip || "").toString() || "unknown";
}

function getKey(req) {
  const token = req.publicToken?.token || req.header("X-Public-Token");
  if (token) return `t:${token}`;
  return `ip:${getClientIp(req)}`;
}

function getLimitPerMin(req) {
  const v = req.publicToken?.rate_limit_per_min;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  return DEFAULT_LIMIT_PER_MIN;
}

function resetInSec(windowStartMs) {
  const remaining = Math.ceil((WINDOW_MS - (nowMs() - windowStartMs)) / 1000);
  return remaining > 0 ? remaining : 0;
}

export function publicRateLimit(req, res, next) {
  try {
    const key = getKey(req);
    const limit = getLimitPerMin(req);
    const burst = DEFAULT_BURST;
    const hardLimit = limit + burst;

    const t = nowMs();

    let b = buckets.get(key);
    if (!b) {
      b = { windowStart: t, count: 0, blockedUntil: 0 };
      buckets.set(key, b);
    }

    // blocked window
    if (b.blockedUntil && t < b.blockedUntil) {
      res.setHeader("Retry-After", String(Math.ceil((b.blockedUntil - t) / 1000)));
      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(resetInSec(b.windowStart)));
      return res.status(429).json({ error: "TOO_MANY_REQUESTS" });
    }

    // new window
    if (t - b.windowStart >= WINDOW_MS) {
      b.windowStart = t;
      b.count = 0;
      b.blockedUntil = 0;
    }

    b.count += 1;

    const remaining = Math.max(0, hardLimit - b.count);

    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.min(remaining, limit)));
    res.setHeader("X-RateLimit-Reset", String(resetInSec(b.windowStart)));

    if (b.count > hardLimit) {
      b.blockedUntil = t + DEFAULT_PENALTY_SEC * 1000;
      res.setHeader("Retry-After", String(DEFAULT_PENALTY_SEC));
      return res.status(429).json({ error: "TOO_MANY_REQUESTS" });
    }

    return next();
  } catch (err) {
    console.error("publicRateLimit error:", err);
    // limiter must never break traffic
    return next();
  }
}
