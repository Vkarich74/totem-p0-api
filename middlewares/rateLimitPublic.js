// middlewares/rateLimitPublic.js — token-aware rate limit (PROD)
// Strategy:
// - if X-Public-Token present → bucket by token
// - else → bucket by IP
// - window: 60s
// - default limits are conservative

import { pool } from "../db/index.js";

const WINDOW_MS = 60 * 1000;
const FALLBACK_LIMIT = 60; // per IP / minute

// in-memory buckets (ok for single instance; Railway proxy-friendly)
const buckets = new Map();

function now() {
  return Date.now();
}

function keyFor(req) {
  const token = req.header("X-Public-Token");
  if (token) return `tok:${token}`;
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  return `ip:${ip}`;
}

export async function publicRateLimit(req, res, next) {
  try {
    const key = keyFor(req);
    const t = now();

    let limit = FALLBACK_LIMIT;

    // token-specific limit (if token validated by publicToken middleware)
    if (req.publicToken && req.publicToken.rate_limit_per_min) {
      limit = req.publicToken.rate_limit_per_min;
    }

    let bucket = buckets.get(key);
    if (!bucket || t - bucket.start >= WINDOW_MS) {
      bucket = { start: t, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > limit) {
      // audit refusal (best-effort)
      try {
        await pool.query(
          `
          INSERT INTO audit_log (event, source, meta)
          VALUES ($1,$2,$3)
          `,
          [
            "RATE_LIMIT",
            "public",
            JSON.stringify({ key, limit })
          ]
        );
      } catch (_) {}

      return res.status(429).json({
        ok: false,
        error: "RATE_LIMIT_EXCEEDED"
      });
    }

    return next();
  } catch (e) {
    // fail-open (do not break traffic)
    return next();
  }
}
