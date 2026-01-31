import crypto from "crypto";
import { pool } from "../db/index.js";

export default async function apiGuard(req, res, next) {
  try {
    let session = null;

    // 1) Bearer header (preferred)
    const auth = String(req.headers["authorization"] || "");
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) session = m[1];

    // 2) Cookie fallback
    if (!session && req.cookies) {
      session = req.cookies.totem_sess;
    }

    if (!session) {
      return res.status(401).json({ error: "AUTH_REQUIRED" });
    }

    const [payloadB64, sig] = session.split(".");
    if (!payloadB64 || !sig) {
      return res.status(401).json({ error: "AUTH_SESSION_INVALID" });
    }

    const secret = process.env.AUTH_SESSION_SECRET || "dev";
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payloadB64)
      .digest("hex");

    if (expected !== sig) {
      return res.status(401).json({ error: "AUTH_SESSION_INVALID" });
    }

    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString());
    const uid = payload.uid;

    const u = await pool.query(
      `
      SELECT id, email, role, salon_slug, master_slug
      FROM auth_users
      WHERE id = $1 AND enabled = true
      `,
      [uid]
    );

    if (u.rowCount === 0) {
      return res.status(401).json({ error: "AUTH_USER_NOT_FOUND" });
    }

    req.user = u.rows[0];
    next();
  } catch (e) {
    console.error("AUTH_GUARD_FAILED", e);
    res.status(500).json({ error: "AUTH_GUARD_FAILED" });
  }
}
