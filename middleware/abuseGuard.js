const buckets = new Map();

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export function abuseGuard(req, res, next) {
  if (process.env.ABUSE_GUARD_ENABLED !== 'true') {
    return next();
  }

  // /system не лимитим (там отдельный requireSystem)
  if (req.path.startsWith('/system')) {
    return next();
  }

  const windowSec = Number(process.env.ABUSE_WINDOW_SEC || 60);
  const maxReq = Number(process.env.ABUSE_MAX_REQUESTS || 120);
  const strict = process.env.ABUSE_GUARD_STRICT === 'true';

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown';

  // strict: требуем базовые признаки нормального клиента
  if (strict) {
    if (!req.headers['user-agent']) {
      return res.status(400).json({ error: 'MISSING_USER_AGENT' });
    }
  }

  const key = `${ip}:${req.path}`;
  const ts = nowSec();

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { start: ts, count: 0 };
    buckets.set(key, bucket);
  }

  if (ts - bucket.start >= windowSec) {
    bucket.start = ts;
    bucket.count = 0;
  }

  bucket.count += 1;

  if (bucket.count > maxReq) {
    return res.status(429).json({
      error: 'RATE_LIMITED',
      window_sec: windowSec,
      max_requests: maxReq
    });
  }

  next();
}
