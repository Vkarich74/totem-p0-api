// middlewares/publicToken.js
// Public token validation middleware (PostgreSQL)
//
// Canonical contract:
// public_tokens.salon_id === salon_slug (PUBLIC identifier)

import { pool } from "../db/index.js";

function normalize(v) {
  return typeof v === "string" ? v.trim().toLowerCase() : null;
}

export async function publicToken(req, res, next) {
  const token = req.header("X-Public-Token");

  // Token is optional (current mode)
  if (!token) return next();

  try {
    const { rows } = await pool.query(
      `
      SELECT
        token,
        salon_id,
        enabled,
        revoked_at,
        rate_limit_per_min
      FROM public_tokens
      WHERE token = $1
      LIMIT 1
      `,
      [token]
    );

    const row = rows[0];

    if (!row || !row.enabled || row.revoked_at) {
      return res.status(401).json({ ok: false, error: "INVALID_PUBLIC_TOKEN" });
    }

    const requestedSalon =
      req.body?.salon_slug ?? req.body?.salonSlug ?? req.body?.salon_id ?? null;

    const tokenSalon = normalize(row.salon_id);
    const requestSalonNorm = normalize(requestedSalon);

    if (requestSalonNorm && tokenSalon !== requestSalonNorm) {
      return res.status(403).json({ ok: false, error: "SALON_TOKEN_MISMATCH" });
    }

    req.publicToken = {
      token: row.token,
      salon_slug: row.salon_id,
      rate_limit_per_min: Number(row.rate_limit_per_min) || 60,
    };

    return next();
  } catch (err) {
    console.error("publicToken middleware error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}
