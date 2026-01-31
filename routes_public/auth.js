import express from "express";
import crypto from "crypto";
import { pool } from "../db/index.js";

const router = express.Router();

/**
 * POST /auth/request
 */
router.post("/request", async (req, res) => {
  const { email, role, salon_slug, master_slug } = req.body;
  if (!email || !role) return res.status(400).json({ error: "INVALID_INPUT" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const user = await client.query(
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
      [user.rows[0].id, token, expires_at]
    );

    const url =
      `https://totem-p0-api-production.up.railway.app/auth/verify` +
      `?token=${token}&return=/`;

    console.log("[AUTH MAGIC LINK]", email, url);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "INTERNAL_ERROR" });
  } finally {
    client.release();
  }
});

/**
 * GET /auth/verify
 */
router.get("/verify", async (req, res) => {
  const { token, return: ret } = req.query;
  if (!token) return res.status(400).send("Missing token");

  const r = await pool.query(
    `SELECT user_id FROM auth_magic_links WHERE token=$1 AND expires_at>now()`,
    [token]
  );
  if (r.rowCount === 0) return res.status(400).send("Link invalid or expired");

  const payload = Buffer.from(JSON.stringify({ v:1, uid:r.rows[0].user_id, iat:Date.now() })).toString("base64");
  const sig = crypto.createHmac("sha256", process.env.AUTH_SESSION_SECRET || "dev").update(payload).digest("hex");

  res.cookie("totem_sess", `${payload}.${sig}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
  });
  res.redirect(ret || "/");
});

export default router;
