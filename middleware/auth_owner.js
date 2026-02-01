// middleware/auth_owner.js
/**
 * Strict Owner Auth (Bearer)
 * - Verifies OWNER_API_TOKEN
 * - Resolves auth_users
 * - Enforces auth_users.enabled = true
 * - Attaches actor context for audit
 */

export function authOwner(req, res, next) {
  const expected = process.env.OWNER_API_TOKEN;
  if (!expected) {
    return res.status(500).json({ error: "OWNER_API_TOKEN_NOT_CONFIGURED" });
  }

  const auth = String(req.headers["authorization"] || "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: "OWNER_TOKEN_REQUIRED" });

  const provided = m[1].trim();
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: "OWNER_TOKEN_INVALID" });
  }

  // DB must be attached earlier in request lifecycle
  const db = req.db;
  if (!db) return res.status(500).json({ error: "DB_NOT_AVAILABLE" });

  let user;
  try {
    // Expect exactly one enabled salon_admin
    user = db
      .prepare(
        `
        SELECT
          id,
          email,
          role,
          salon_slug,
          enabled
        FROM auth_users
        WHERE role = 'salon_admin'
        ORDER BY id ASC
        LIMIT 1
      `
      )
      .get();
  } catch {
    return res.status(500).json({ error: "OWNER_LOOKUP_FAILED" });
  }

  if (!user) return res.status(403).json({ error: "OWNER_NOT_FOUND" });
  if (!user.enabled) return res.status(403).json({ error: "OWNER_DISABLED" });

  // Attach canonical actor context
  req.actor = {
    type: "owner",
    user_id: user.id,
    email: user.email,
    salon_slug: user.salon_slug,
    role: user.role,
  };

  return next();
}

export function requireOwner(req, res, next) {
  if (req.actor?.type !== "owner") {
    return res.status(403).json({ error: "OWNER_ONLY" });
  }
  return next();
}
