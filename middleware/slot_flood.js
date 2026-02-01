// middleware/slot_flood.js
// Soft protection against slot flooding
// Rule: same IP + same slot (salon/master/service/date/start_time)
// Limit: MAX_ATTEMPTS per WINDOW_MS
// Response: 429 with retry_after_ms

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 3;

const buckets = new Map();

function now() {
  return Date.now();
}

function keyFrom(req) {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  const { salon_slug, master_slug, service_id, date, start_time } = req.body || {};
  return `slot:${ip}:${salon_slug}:${master_slug}:${service_id}:${date}:${start_time}`;
}

export function slotFloodGuard(req, res, next) {
  const key = keyFrom(req);
  const t = now();

  let b = buckets.get(key);
  if (!b || t - b.start >= WINDOW_MS) {
    b = { start: t, count: 0 };
    buckets.set(key, b);
  }

  b.count += 1;

  if (b.count > MAX_ATTEMPTS) {
    res.status(429).json({
      ok: false,
      error: 'slot_flood',
      retry_after_ms: Math.max(0, WINDOW_MS - (t - b.start)),
    });
    return;
  }

  next();
}
