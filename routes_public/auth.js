import express from "express";
import crypto from "crypto";
import { pool } from "../db/index.js";

const router = express.Router();

const MAGIC_LINK_TTL_MIN = 10;

/**
 * GET /auth
 * Simple email input form
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
  <style>
    body { font-family: system-ui, sans-serif; background:#f6f6f6; padding:24px; }
    .card { max-width:420px; margin:0 auto; background:#fff; border-radius:12px; padding:20px; box-shadow:0 10px 30px rgba(0,0,0,.08); }
    input, button { width:100%; padding:12px; margin-top:12px; font-size:16px; }
    button { background:#111; color:#fff; border:none; border-radius:8px; cursor:pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Вход</h2>
    <form method="POST" action="/auth/request">
      <input type="email" name="email" placeholder="email@example.com" required />
      <input type="hidden" name="role" value="${role}" />
      <input type="hidden" name="return" value="${returnUrl}" />
      <button type="submit">Получить ссылку</button>
    </form>
  </div>
</body>
</html>`);
});

/**
 * POST /auth/request
 * Create magic link (logged to console)
 */
router.post("/auth/request", express.urlencoded({ extended: false }), async (req, res) => {
  const { email, role, return: returnUrl } = req.body;

  if (!email || !role) {
    res.status(400).send("Invalid request");
    return;
  }

  const client = await pool.connect();
  try {
    // upsert user
    const userRes = await client.query(
      `INSERT INTO auth_users (email, role)
       VALUES ($1, $2)
       ON CONFLICT (email, role)
       DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [email.toLowerCase(), role]
    );

    const userId = userRes.rows[0].id;

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60 * 1000);

    await client.query(
      `INSERT INTO auth_magic_links (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, token, expiresAt]
    );

    const link =
      `${req.protocol}://${req.get("host")}` +
      `/auth/verify?token=${token}&return=${encodeURIComponent(returnUrl || "/")}`;

    // v1: log magic link instead of sending email
    console.log("[AUTH MAGIC LINK]", email, link);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<p>Проверьте почту. Ссылка отправлена.</p>`);
  } finally {
    client.release();
  }
});

/**
 * GET /auth/verify
 * Verify token and login
 */
router.get("/auth/verify", async (req, res) => {
  const { token, return: returnUrl } = req.query;

  if (!token) {
    res.status(400).send("Missing token");
    return;
  }

  const client = await pool.connect();
  try {
    const linkRes = await client.query(
      `SELECT aml.id, au.email, au.role
       FROM auth_magic_links aml
       JOIN auth_users au ON au.id = aml.user_id
       WHERE aml.token = $1
         AND aml.used_at IS NULL
         AND aml.expires_at > now()
       LIMIT 1`,
      [token]
    );

    if (linkRes.rowCount === 0) {
      res.status(400).send("Ссылка недействительна или устарела");
      return;
    }

    const linkId = linkRes.rows[0].id;

    await client.query(
      `UPDATE auth_magic_links SET used_at = now() WHERE id = $1`,
      [linkId]
    );

    // v1: simple session cookie (stub)
    res.cookie("totem_auth", "ok", {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });

    res.redirect(returnUrl || "/");
  } finally {
    client.release();
  }
});

export default router;
