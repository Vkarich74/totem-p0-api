// middlewares/publicToken.js
// Public token validation middleware
// Canonical contract:
// public_tokens.salon_id === salon_slug (PUBLIC identifier)

import { db } from "../db/index.js";

export async function publicToken(req, res, next) {
  const token = req.header("X-Public-Token");

  // Token is optional (current mode)
  if (!token) {
    return next();
  }

  try {
    const row = db
      .prepare(
        `
        SELECT
          token,
          salon_id,
          enabled,
          revoked_at
        FROM public_tokens
        WHERE token = ?
        LIMIT 1
        `
      )
      .get(token);

    // token not found or revoked
    if (!row || !row.enabled || row.revoked_at) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_PUBLIC_TOKEN",
      });
    }

    // salon binding check (slug-to-slug)
    const requestedSalon = req.body?.salon_slug;

    if (requestedSalon && row.salon_id !== requestedSalon) {
      return res.status(403).json({
        ok: false,
        error: "SALON_TOKEN_MISMATCH",
      });
    }

    // attach token context
    req.publicToken = {
      token: row.token,
      salon_slug: row.salon_id,
    };

    next();
  } catch (err) {
    console.error("publicToken middleware error:", err);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
}
