import { pool } from "../db/index.js";

/**
 * API_GUARD v1
 *
 * Rules:
 * - Requires auth cookie: totem_auth
 * - Loads user from DB
 * - Enforces role binding (DB constraints already exist)
 * - Missing / invalid binding → 403
 *
 * Usage:
 *   app.use("/owner", apiGuard)
 */
export default async function apiGuard(req, res, next) {
  try {
    const authCookie = req.cookies?.totem_auth;

    if (!authCookie) {
      return res.status(403).json({ error: "AUTH_REQUIRED" });
    }

    const client = await pool.connect();
    try {
      // v1 stub: since cookie == "ok", we just take LAST active user
      // IMPORTANT: this is TEMP for v1, will be replaced by session/user_id
      const userRes = await client.query(
        `SELECT id, email, role, salon_slug, master_slug
         FROM auth_users
         WHERE enabled = true
         ORDER BY created_at DESC
         LIMIT 1`
      );

      if (userRes.rowCount === 0) {
        return res.status(403).json({ error: "AUTH_USER_NOT_FOUND" });
      }

      const user = userRes.rows[0];

      // Enforce binding invariants (already guaranteed by DB, but double-check)
      if (user.role === "salon_admin") {
        if (!user.salon_slug || user.master_slug !== null) {
          return res.status(403).json({ error: "INVALID_ROLE_BINDING" });
        }
      }

      if (user.role === "master") {
        if (!user.master_slug || user.salon_slug !== null) {
          return res.status(403).json({ error: "INVALID_ROLE_BINDING" });
        }
      }

      // Attach user to request
      req.user = user;
      next();
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[API_GUARD]", err);
    res.status(500).json({ error: "AUTH_GUARD_FAILED" });
  }
}
