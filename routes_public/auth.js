import express from "express";
import crypto from "crypto";
import { pool } from "../db/index.js";

const router = express.Router();
const MAGIC_LINK_TTL_MIN = 10;

/**
 * GET /auth
 */
router.get("/auth", (req, res) => {
  const role = req.query.role || "salon_admin";
  const returnUrl = req.query.return || "/";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <title>Вход</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <h2>Вход</h2>
  <form method="POST" action="/auth/request">
    <input type="email" name="email" placeholder="email@example.com" required />
    <input type="hidden" name="role" value="${role}" />
    <input type="hidden" name="return" value="${returnUrl}" />
    <button type="submit">Получить ссылку</button>
  </form>
</body>
</html>`);
});

/**
 * POST /auth/request
 */
router.post(
  "/auth/request",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const { email, role, return: returnUrl } = req.body;
    if (!email || !role) return res.status(400).send("Invalid request");

    const client = await pool.connect();
    try {
      const userRes = await client.query(
        `INSERT INTO auth_users (email, role)
         VALUES ($1, $2)
         ON CONFLICT (email, role)
         DO UPDATE SET email = EXCLUDED.email
         RETURNING id`,
        [email.toLowerCase(), role]
      );

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60 * 1000);

      await client.query(
        `INSERT INTO auth_magic_links (user_id, token, expires_at)
         VALUES ($1, $2, $3)`,
        [userRes.rows[0].id, token, expiresAt]
      );

      const link =
        `${req.protocol}://${req.get("host")}` +
        `/auth/verify?token=${token}&return=${encodeURIComponent(returnUrl || "/")}`;

      console.log("[AUTH MAGIC LINK]", email, link);
      res.send("Magic link generated. Check logs.");
    } finally {
      client.release();
    }
  }
);

/**
 * GET /auth/verify
 */
router.get("/auth/verify", async (req, res) => {
  const { token, return: returnUrl } = req.query;
  if (!token) return res.status(400).send("Missing token");

  const client = await pool.connect();
  try {
    const linkRes = await client.query(
      `SELECT id
       FROM auth_magic_links
       WHERE token = $1
         AND used_at IS NULL
         AND expires_at > now()
       LIMIT 1`,
      [token]
    );

    if (linkRes.rowCount === 0) {
      return res.status(400).send("Link invalid or expired");
    }

    await client.query(
      `UPDATE auth_magic_links SET used_at = now() WHERE id = $1`,
      [linkRes.rows[0].id]
    );

    // ✅ CRITICAL FIX FOR RAILWAY
    res.cookie("totem_auth", "ok", {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    });

    res.redirect(returnUrl || "/");
  } finally {
    client.release();
  }
});

export default router;
