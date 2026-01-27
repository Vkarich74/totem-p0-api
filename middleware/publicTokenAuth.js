// middleware/publicTokenAuth.js
import { readPublicTokenByRaw, hashToken } from "../core/publicTokens.js";

/**
 * Public token auth (Bearer)
 * - tenant берём ТОЛЬКО из public token
 * - scopes enforced per-route
 * - обновляем last_used_at
 */

function hasScope(scopes, required) {
  if (!required) return true;
  const set = new Set(Array.isArray(scopes) ? scopes : []);
  if (Array.isArray(required)) return required.every((s) => set.has(s));
  return set.has(String(required));
}

export function publicTokenAuth({ db, requiredScope = null }) {
  return (req, res, next) => {
    const auth = String(req.headers["authorization"] || "");
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: "PUBLIC_TOKEN_REQUIRED" });

    const rawToken = m[1].trim();
    if (!rawToken) return res.status(401).json({ error: "PUBLIC_TOKEN_REQUIRED" });

    const token = readPublicTokenByRaw(db, rawToken);
    if (!token) return res.status(401).json({ error: "PUBLIC_TOKEN_INVALID" });

    if (token.revoked_at) return res.status(401).json({ error: "PUBLIC_TOKEN_REVOKED" });

    const now = Date.now();
    const exp = Date.parse(token.expires_at);
    if (!Number.isFinite(exp) || exp <= now) {
      return res.status(401).json({ error: "PUBLIC_TOKEN_EXPIRED" });
    }

    if (!hasScope(token.scopes, requiredScope)) {
      return res.status(403).json({ error: "INSUFFICIENT_SCOPE" });
    }

    // attach public context
    req.public = {
      token_id: token.id,
      tenant_id: String(token.tenant_id),
      salon_id: token.salon_id === null || token.salon_id === undefined ? null : String(token.salon_id),
      scopes: token.scopes,
      token_hash: hashToken(rawToken),
    };

    // best-effort last_used_at update (не должен валить запрос)
    try {
      db.prepare("UPDATE public_tokens SET last_used_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        token.id
      );
    } catch {}

    return next();
  };
}

/**
 * CORS for public SDK/widget
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
 * Simple in-memory public rate limit (token_hash + ip)
 * windowSec default 60, limit default 120
 */
export function publicRateLimit({ windowSec = 60, limit = 120 } = {}) {
  const bucket = new Map(); // key -> { resetAt, count }

  return (req, res, next) => {
    const ip =
      String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    const tok = req.public?.token_hash || "no-token";
    const key = `${tok}|${ip}`;

    const now = Date.now();
    const resetAt = now + windowSec * 1000;

    let rec = bucket.get(key);
    if (!rec || rec.resetAt <= now) {
      rec = { resetAt, count: 0 };
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
