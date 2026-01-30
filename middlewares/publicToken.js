// middlewares/publicToken.js — X-Public-Token guard (HARDENED)
// Modes:
// - TOKEN_REQUIRED=false (default): no token allowed; invalid token blocked
// - TOKEN_REQUIRED=true: token required for all /public routes

import { pool } from "../db/index.js";

const TOKEN_REQUIRED = false; // <-- включим позже одним флагом

export async function publicToken(req, res, next) {
  const token = req.header("X-Public-Token");

  if (!token) {
    if (TOKEN_REQUIRED) {
      return res.status(401).json({
        ok: false,
        error: "PUBLIC_TOKEN_REQUIRED"
      });
    }
    return next();
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT salon_id, enabled, revoked_at, rate_limit_per_min
      FROM public_tokens
      WHERE token = $1
      `,
      [token]
    );

    if (!rows.length || !rows[0].enabled || rows[0].revoked_at) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_PUBLIC_TOKEN"
      });
    }

    req.publicToken = {
      token,
      salon_id: rows[0].salon_id,
      rate_limit_per_min: rows[0].rate_limit_per_min
    };

    return next();
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "PUBLIC_TOKEN_ERROR"
    });
  }
}
