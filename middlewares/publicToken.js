// middlewares/publicToken.js
// Public Token middleware — CANONICAL v1
// Token is OPTIONAL unless TOKEN_REQUIRED=true

import { pool } from "../db/index.js";

const TOKEN_REQUIRED = false; // v1: optional

export async function publicToken(req, res, next) {
  try {
    const token =
      req.header("X-Public-Token") ||
      req.query?.public_token ||
      null;

    if (!token) {
      if (TOKEN_REQUIRED) {
        return res.status(401).json({ error: "TOKEN_REQUIRED" });
      }
      return next();
    }

    const { rows, rowCount } = await pool.query(
      `
      SELECT token, salon_id, rate_limit_per_min
      FROM public_tokens
      WHERE token = $1
        AND enabled = true
        AND revoked_at IS NULL
      LIMIT 1
      `,
      [token]
    );

    if (rowCount === 0) {
      return res.status(401).json({ error: "INVALID_TOKEN" });
    }

    req.publicToken = {
      token: rows[0].token,
      salon_id: rows[0].salon_id,
      rate_limit_per_min: rows[0].rate_limit_per_min,
    };

    return next();
  } catch (err) {
    console.error("publicToken error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
