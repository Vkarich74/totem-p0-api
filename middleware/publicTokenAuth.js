// middleware/publicTokenAuth.js
import crypto from "crypto";

/**
 * Public token auth (Bearer)
 * STRICTLY aligned with DB table: public_tokens
 *
 * Enforces:
 * - token exists
 * - enabled = true
 * - revoked_at IS NULL
 * - rate_limit_per_min (DB-driven)
 *
 * NO scopes
 * NO tenant_id
 * NO legacy fields
 */

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function publicTokenAuth({ db }) {
  return (req, res, next) => {
    const auth = String(req.headers["authorization"] || "");
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: "PUBLIC_TOKEN_REQUIRED" });

    const rawToken = m[1].trim();
    if (!rawToken) return res.status(401).json({ error: "PUBLIC_TOKEN_REQUIRED" });

    let token;
    try {
      token = db
        .prepare(
          `
          SELECT
            id,
            salon_id,
            enabled,
            revoked_at,
            rate_limit_per_min
          FROM public_tokens
          WHERE token = ?
          LIMIT 1
        `
        )
        .get(rawToken);
    } catch {
      return res.status(500).json({ error: "PUBLIC_TOKEN_LOOKUP_FAILED" });
    }

    if (!token) return res.status(401).json({ error: "PUBLIC_TOKEN_INVALID" });
    if (!token.enabled) return res.status(401).json({ error: "PUBLIC_TOKEN_DISABLED" });
    if (token.revoked_at) return res.status(401).json({ error: "PUBLIC_TOKEN_REVOKED" });

    req.public = {
      token_id: token.id,
      salon_id: String(token.salon_id),
      rate_limit_per_min: Number(token.rate_limit_per_min),
      token_hash: hashToken(rawToken),
    };

    return next();
  };
}

/**
 * CORS for public SDK / widget
 */
export function publicCors(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "600");
  if (req.method === "OPTIONS") return res.status(204).send("");
  return next();
}

/**
 * Rate limit per token (per minute, from DB)
 */
export function publicRateLimit() {
  const bucket = new Map(); // key -> { resetAt, count }

  return (req, res, next) => {
    if (!req.public) return res.status(500).json({ error: "PUBLIC_CONTEXT_MISSING" });

    const limit = req.public.rate_limit_per_min;
    const windowMs = 60 * 1000;

    const ip =
      String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    const key = `${req.public.token_hash}|${ip}`;
    const now = Date.now();

    let rec = bucket.get(key);
    if (!rec || rec.resetAt <= now) {
      rec = { resetAt: now + windowMs, count: 0 };
      bucket.set(key, rec);
    }

    rec.count += 1;

    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - rec.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(rec.resetAt / 1000)));

    if (rec.count > limit) {
      return res.status(429).json({ error: "RATE_LIMITED" });
    }

    return next();
  };
}
