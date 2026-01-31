import express from "express";
import crypto from "crypto";
import { pool } from "../db/index.js";

const router = express.Router();

function signSession(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64");
  const secret = process.env.AUTH_SESSION_SECRET || "dev";
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/**
 * POST /auth/request
 * Generate magic link token (JSON flow friendly)
 */
router.post("/request", async (req, res) => {
  const { email, role, salon_slug, master_slug } = req.body;
  if (!email || !role) return res.status(400).json({ error: "INVALID_INPUT" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const u = await client.query(
      `
      INSERT INTO auth_users (email, role, salon_slug, master_slug, enabled)
      VALUES ($1,$2,$3,$4,true)
      ON CONFLICT (email, role) DO UPDATE SET enabled=true
      RETURNING id
      `,
      [email, role, salon_slug || null, master_slug || null]
    );

    const token = crypto.randomBytes(32).toString("hex");
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await client.query(
      `INSERT INTO auth_magic_links (user_id, token, expires_at) VALUES ($1,$2,$3)`,
      [u.rows[0].id, token, expires_at]
    );

    console.log(
      "[AUTH MAGIC LINK]",
      email,
      `https://totem-p0-api-production.up.railway.app/auth/verify-json?token=${token}`
    );

    await client.query("COMMIT");
    res.json({ ok: true, token });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("AUTH_REQUEST_ERROR", e);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  } finally {
    client.release();
  }
});

/**
 * GET /auth/verify-json
 * CMD-safe verification (NO cookies)
 */
router.get("/verify-json", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "TOKEN_REQUIRED" });

  const r = await pool.query(
    `
    SELECT u.id, u.email, u.role, u.salon_slug, u.master_slug
    FROM auth_magic_links aml
    JOIN auth_users u ON u.id = aml.user_id
    WHERE aml.token = $1 AND aml.expires_at > now()
    `,
    [token]
  );

  if (r.rowCount === 0) {
    return res.status(400).json({ error: "TOKEN_INVALID_OR_EXPIRED" });
  }

  res.json({ ok: true, user: r.rows[0] });
});

/**
 * POST /auth/session
 * Exchange magic token for signed session (Bearer)
 */
router.post("/session", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "TOKEN_REQUIRED" });

  const r = await pool.query(
    `
    SELECT u.id
    FROM auth_magic_links aml
    JOIN auth_users u ON u.id = aml.user_id
    WHERE aml.token = $1 AND aml.expires_at > now()
    `,
    [token]
  );

  if (r.rowCount === 0) {
    return res.status(400).json({ error: "TOKEN_INVALID_OR_EXPIRED" });
  }

  const session = signSession({ v: 1, uid: r.rows[0].id, iat: Date.now() });
  res.json({ ok: true, session });
});

export default router;
