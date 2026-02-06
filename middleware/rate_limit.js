// middleware/rate_limit.js
// App-level rate limit (no Redis)
// Scope: public endpoints
// Response: 429 on limit exceeded

const WINDOW_MS = 60 * 1000; // 1 minute
const LIMIT_PUBLIC = 60;    // 60 req/min per IP
const buckets = new Map();

function now() {
  return Date.now();
}

function getBucket(key) {
  const t = now();
  let b = buckets.get(key);
  if (!b || t - b.start >= WINDOW_MS) {
    b = { start: t, count: 0 };
    buckets.set(key, b);
  }
  return b;
}

export function rateLimitPublic(req, res, next) {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  const b = getBucket(`pub:${ip}`);
  b.count += 1;

  if (b.count > LIMIT_PUBLIC) {
    res.status(429).json({
      ok: false,
      error: 'rate_limit_exceeded',
      retry_after_ms: Math.max(0, WINDOW_MS - (now() - b.start)),
    });
    return;
  }

  next();
}
