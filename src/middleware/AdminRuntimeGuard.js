import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import {
  isAuthResolveSessionExpired,
  isAuthResolveIdleExpired,
} from "../auth/sharedSession.js";

function parseBearer(req) {
  const header = String(req.headers.authorization || "").trim();
  if (!header) return "";

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1] || "").trim() : "";
}

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) {
    throw new Error("JWT_SECRET_NOT_SET");
  }
  return secret;
}

function verifyAdminJwt(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

export default async function AdminRuntimeGuard(req, res, next) {
  const token = parseBearer(req);
  if (!token) {
    return res.status(401).json({
      ok: false,
      error: "NO_AUTH",
    });
  }

  const payload = verifyAdminJwt(token);
  if (!payload) {
    return res.status(401).json({
      ok: false,
      error: "INVALID_TOKEN",
    });
  }

  if (
    !payload ||
    String(payload.role || "") !== "admin" ||
    !payload.user_id ||
    !payload.session_id
  ) {
    return res.status(403).json({
      ok: false,
      error: "FORBIDDEN",
    });
  }

  const userId = Number(payload.user_id);
  const sessionId = String(payload.session_id || "");

  if (!Number.isFinite(userId) || !sessionId) {
    return res.status(403).json({
      ok: false,
      error: "FORBIDDEN",
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        s.id,
        s.user_id,
        s.expires_at,
        s.last_seen_at,
        s.revoked_at,
        u.role,
        u.enabled
      FROM public.auth_sessions s
      JOIN public.auth_users u ON u.id = s.user_id
      WHERE s.id = $1
        AND s.user_id = $2
      LIMIT 1
      `,
      [sessionId, userId],
    );

    const session = result.rows?.[0];

    if (
      !session ||
      !session.enabled ||
      String(session.role || "") !== "admin" ||
      session.revoked_at
    ) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_SESSION",
      });
    }

    const lastSeenAt = session.last_seen_at || session.expires_at || new Date().toISOString();
    const authSnapshot = {
      session_expires_at: session.expires_at,
      idle_timeout_at: session.last_seen_at ? new Date(new Date(lastSeenAt).getTime() + 24 * 60 * 60 * 1000).toISOString() : null,
    };

    if (isAuthResolveSessionExpired(authSnapshot) || isAuthResolveIdleExpired(authSnapshot)) {
      return res.status(401).json({
        ok: false,
        error: "SESSION_EXPIRED",
      });
    }

    req.admin = {
      user_id: Number(session.user_id),
      role: String(session.role || "admin"),
      session_id: session.id,
    };

    return next();
  } catch (error) {
    console.error("ADMIN_RUNTIME_GUARD_ERROR", error);
    return res.status(500).json({
      ok: false,
      error: "ADMIN_GUARD_FAILED",
    });
  }
}
