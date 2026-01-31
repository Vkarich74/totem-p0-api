import crypto from "crypto";
import { pool } from "../db/index.js";

/**
 * API_GUARD v2 FINAL
 *
 * Accepts ONLY:
 * - signed session cookie `totem_sess`
 */

function base64urlDecode(str) {
  const pad = str.length % 4;
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + (pad ? "=".repeat(4 - pad) : "");
  return Buffer.from(base64, "base64").toString("utf8");
}

function verifySessionCookie(cookie, secret) {
  const parts = cookie.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  if (expectedSig !== sigB64) return null;

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64));
  } catch {
    return null;
  }

  if (payload.v !== 1 || !payload.uid || !payload.exp) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  return payload;
}

export default async function apiGuard(req, res, next) {
  try {
    const sessionCookie = req.cookies?.totem_sess;
    if (!sessionCookie) {
      return res.status(401).json({ error: "AUTH_REQUIRED" });
    }

    const secret = process.env.AUTH_SESSION_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "AUTH_MISCONFIGURED" });
    }

    const payload = verifySessionCookie(sessionCookie, secret);
    if (!payload) {
      return res.status(401).json({ error: "AUTH_SESSION_INVALID" });
    }

    const client = await pool.connect();
    try {
      const userRes = await client.query(
        `SELECT id, email, role, salon_slug, master_slug, enabled
         FROM auth_users
         WHERE id = $1`,
        [payload.uid]
      );

      if (userRes.rowCount === 0) {
        return res.status(401).json({ error: "AUTH_USER_NOT_FOUND" });
      }

      const user = userRes.rows[0];

      if (user.enabled !== true) {
        return res.status(403).json({ error: "USER_DISABLED" });
      }

      if (user.role === "salon_admin") {
        if (!user.salon_slug || user.master_slug !== null) {
          return res.status(409).json({ error: "BINDING_REQUIRED" });
        }
      }

      if (user.role === "master") {
        if (!user.master_slug || user.salon_slug !== null) {
          return res.status(409).json({ error: "BINDING_REQUIRED" });
        }
      }

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
