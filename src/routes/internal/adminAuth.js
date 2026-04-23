import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { pool } from "../../db.js";
import {
  createAuthSession,
  isAuthResolveSessionExpired,
  isAuthResolveIdleExpired,
  revokeAuthSession,
} from "../../auth/sharedSession.js";

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

function signAdminJwt(payload) {
  return jwt.sign(payload, getJwtSecret());
}

function verifyAdminJwt(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

function computeIdleTimeoutAt(lastSeenAt) {
  if (!lastSeenAt) return null;

  const ts = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(ts)) return null;

  return new Date(ts + 24 * 60 * 60 * 1000).toISOString();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export default function buildAdminAuthRouter() {
  const r = express.Router();

  r.post("/login", async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");

    if (!email || !password.trim()) {
      return res.status(400).json({
        ok: false,
        error: "LOGIN_PAYLOAD_INVALID",
      });
    }

    try {
      const userResult = await pool.query(
        `
        SELECT id, email, role, enabled, password_hash
        FROM public.auth_users
        WHERE lower(email) = lower($1)
          AND role = 'admin'
          AND enabled = true
        LIMIT 1
        `,
        [email],
      );

      const user = userResult.rows?.[0];
      if (!user || !user.password_hash) {
        return res.status(401).json({
          ok: false,
          error: "INVALID_CREDENTIALS",
        });
      }

      const passwordOk = await bcrypt.compare(password, String(user.password_hash));
      if (!passwordOk) {
        return res.status(401).json({
          ok: false,
          error: "INVALID_CREDENTIALS",
        });
      }

      const session = await createAuthSession(pool, Number(user.id));
      const accessToken = signAdminJwt({
        user_id: Number(user.id),
        role: "admin",
        session_id: session.id,
      });

      return res.status(200).json({
        ok: true,
        access_token: accessToken,
        token_type: "Bearer",
        auth: {
          user_id: Number(user.id),
          role: "admin",
          source: "admin_password_login",
          session_id: session.id,
          session_source: "auth_sessions",
          session_expires_at: session.expires_at,
          last_seen_at: session.last_seen_at,
          idle_timeout_at: session.idle_timeout_at,
        },
      });
    } catch (error) {
      console.error("ADMIN_AUTH_LOGIN_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_AUTH_LOGIN_FAILED",
      });
    }
  });

  r.get("/session", async (req, res) => {
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

    if (String(payload.role || "") !== "admin") {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
      });
    }

    const userId = Number(payload.user_id);
    const sessionId = String(payload.session_id || "");

    if (!Number.isFinite(userId) || !sessionId) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_TOKEN",
      });
    }

    try {
      const sessionResult = await pool.query(
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

      const session = sessionResult.rows?.[0];

      if (!session || !session.enabled || String(session.role || "") !== "admin" || session.revoked_at) {
        return res.status(401).json({
          ok: false,
          error: "INVALID_SESSION",
        });
      }

      const lastSeenAt = session.last_seen_at || session.expires_at || new Date().toISOString();
      const authSnapshot = {
        session_expires_at: session.expires_at,
        idle_timeout_at: computeIdleTimeoutAt(lastSeenAt),
      };

      if (isAuthResolveSessionExpired(authSnapshot) || isAuthResolveIdleExpired(authSnapshot)) {
        return res.status(401).json({
          ok: false,
          error: "SESSION_EXPIRED",
        });
      }

      const nowIso = new Date().toISOString();

      await pool.query(
        `
        UPDATE public.auth_sessions
        SET last_seen_at = NOW()
        WHERE id = $1
          AND user_id = $2
          AND revoked_at IS NULL
        `,
        [sessionId, userId],
      );

      return res.status(200).json({
        ok: true,
        authenticated: true,
        auth: {
          user_id: Number(session.user_id),
          role: "admin",
          source: "admin_session",
          session_id: session.id,
          session_source: "auth_sessions",
          session_expires_at: session.expires_at,
          last_seen_at: nowIso,
          idle_timeout_at: computeIdleTimeoutAt(nowIso),
        },
      });
    } catch (error) {
      console.error("ADMIN_AUTH_SESSION_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_AUTH_SESSION_FAILED",
      });
    }
  });

  r.post("/logout", async (req, res) => {
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

    if (String(payload.role || "") !== "admin") {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
      });
    }

    const sessionId = String(payload.session_id || "");
    if (!sessionId) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_TOKEN",
      });
    }

    try {
      await revokeAuthSession(pool, sessionId, "admin_logout");
      return res.status(200).json({
        ok: true,
      });
    } catch (error) {
      console.error("ADMIN_AUTH_LOGOUT_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_AUTH_LOGOUT_FAILED",
      });
    }
  });

  return r;
}
