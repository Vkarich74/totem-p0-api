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
  const header = String(req.headers?.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function computeIdleTimeoutAt(lastSeenAt) {
  if (!lastSeenAt) return null;
  const ts = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(ts)) return null;
  return new Date(ts + 24 * 60 * 60 * 1000).toISOString();
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
  return jwt.verify(token, getJwtSecret());
}

export default function buildAdminAuthRouter() {
  const r = express.Router();

  r.post("/login", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        error: "LOGIN_PAYLOAD_INVALID",
      });
    }

    const db = await pool.connect();

    try {
      const userRes = await db.query(
        `
        SELECT id, role, enabled, password_hash
        FROM public.auth_users
        WHERE lower(email)=lower($1)
          AND role='admin'
          AND enabled=true
        LIMIT 1
        `,
        [email]
      );

      const user = userRes.rows[0] || null;

      if (!user?.password_hash) {
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

      const session = await createAuthSession(db, Number(user.id));
      const accessToken = signAdminJwt({
        user_id: Number(user.id),
        role: String(user.role),
        session_id: session.id,
      });

      return res.json({
        ok: true,
        access_token: accessToken,
        token_type: "Bearer",
        auth: {
          user_id: Number(user.id),
          role: String(user.role),
          source: "admin_password_login",
          session_id: session.id,
          session_source: "auth_sessions",
          session_expires_at: session.expires_at,
          last_seen_at: session.last_seen_at,
          idle_timeout_at: session.idle_timeout_at,
        },
      });
    } catch (error) {
      if (String(error?.message || "") === "JWT_SECRET_NOT_SET") {
        throw error;
      }

      console.error("ADMIN_LOGIN_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_LOGIN_FAILED",
      });
    } finally {
      db.release();
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

    let payload;

    try {
      payload = verifyAdminJwt(token);
    } catch (error) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_TOKEN",
      });
    }

    if (String(payload?.role || "") !== "admin") {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
      });
    }

    const userId = Number(payload?.user_id);
    const sessionId = String(payload?.session_id || "").trim();

    if (!Number.isInteger(userId) || userId <= 0 || !sessionId) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_SESSION",
      });
    }

    const db = await pool.connect();

    try {
      const sessionRes = await db.query(
        `
        SELECT
          s.id,
          s.user_id,
          s.expires_at,
          s.last_seen_at,
          s.revoked_at,
          u.enabled,
          u.role
        FROM public.auth_sessions s
        JOIN public.auth_users u ON u.id = s.user_id
        WHERE s.id = $1
          AND s.user_id = $2
        LIMIT 1
        `,
        [sessionId, userId]
      );

      const sessionRow = sessionRes.rows[0] || null;

      if (!sessionRow) {
        return res.status(401).json({
          ok: false,
          error: "INVALID_SESSION",
        });
      }

      if (!sessionRow.enabled || String(sessionRow.role) !== "admin") {
        return res.status(401).json({
          ok: false,
          error: "INVALID_SESSION",
        });
      }

      const authSnapshot = {
        session_expires_at: sessionRow.expires_at || null,
        idle_timeout_at: computeIdleTimeoutAt(sessionRow.last_seen_at),
      };

      if (sessionRow.revoked_at) {
        return res.status(401).json({
          ok: false,
          error: "INVALID_SESSION",
        });
      }

      if (isAuthResolveSessionExpired(authSnapshot) || isAuthResolveIdleExpired(authSnapshot)) {
        return res.status(401).json({
          ok: false,
          error: "SESSION_EXPIRED",
        });
      }

      const nowIso = new Date().toISOString();
      await db.query(
        `
        UPDATE public.auth_sessions
        SET last_seen_at = NOW()
        WHERE id = $1
          AND user_id = $2
        `,
        [sessionId, userId]
      );

      return res.json({
        ok: true,
        authenticated: true,
        auth: {
          user_id: userId,
          role: "admin",
          source: "admin_session",
          session_id: sessionId,
          session_source: "auth_sessions",
          session_expires_at: sessionRow.expires_at || null,
          last_seen_at: nowIso,
          idle_timeout_at: computeIdleTimeoutAt(nowIso),
        },
      });
    } catch (error) {
      console.error("ADMIN_SESSION_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_SESSION_FAILED",
      });
    } finally {
      db.release();
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

    let payload;

    try {
      payload = verifyAdminJwt(token);
    } catch (error) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_TOKEN",
      });
    }

    if (String(payload?.role || "") !== "admin") {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
      });
    }

    const sessionId = String(payload?.session_id || "").trim();

    if (!sessionId) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_SESSION",
      });
    }

    const db = await pool.connect();

    try {
      await revokeAuthSession(db, sessionId, "admin_logout");
      return res.json({ ok: true });
    } catch (error) {
      console.error("ADMIN_LOGOUT_ERROR", error);
      return res.status(500).json({
        ok: false,
        error: "ADMIN_LOGOUT_FAILED",
      });
    } finally {
      db.release();
    }
  });

  return r;
}
