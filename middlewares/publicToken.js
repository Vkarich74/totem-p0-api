// middlewares/publicToken.js — X-Public-Token guard (ENFORCE INVALID)

import { pool } from "../db/index.js";

export async function publicToken(req, res, next) {
  const token = req.header("X-Public-Token");

  // no token → backward compatible (allowed)
  if (!token) {
    return next();
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT salon_id, enabled, revoked_at
      FROM public_tokens
      WHERE token = $1
      `,
      [token]
    );

    // token provided but invalid / revoked / disabled
    if (
      !rows.length ||
      !rows[0].enabled ||
      rows[0].revoked_at
    ) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_PUBLIC_TOKEN"
      });
    }

    // attach enforced context
    req.publicToken = {
      token,
      salon_id: rows[0].salon_id
    };

    return next();
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "PUBLIC_TOKEN_ERROR"
    });
  }
}
