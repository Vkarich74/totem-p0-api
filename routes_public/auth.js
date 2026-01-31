import express from "express";
import crypto from "crypto";
import { pool } from "../db/index.js";

const router = express.Router();
const MAGIC_LINK_TTL_MIN = 10;

// v1 hard binding
const DEFAULT_SALON_SLUG = "totem-demo-salon";

/**
 * GET /auth
 */
router.get("/auth", (req, res) => {
  const returnUrl = req.query.return || "/";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`
    <h2>Вход администратора салона</h2>
    <form method="POST" action="/auth/request">
      <input type="email" name="email" placeholder="email@example.com" required />
      <input type="hidden" name="return" value="${returnUrl}" />
      <button type="submit">Получить ссылку</button>
    </form>
  `);
});

/**
 * POST /auth/request
 * v1: create salon_admin WITH binding
 */
router.post(
  "/auth/request",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const { email, return: returnUrl } = req.body;
    if (!email) return res.status(400).send("Invalid request");

    const client = await pool.connect();
    try {
      // sanity: salon must exist
      const salonRes = await client.query(
        `SELECT slug FROM salons WHERE slug = $1 AND enabled = true`,
        [DEFAULT_SALON_SLUG]
      );

      if (salonRes.rowCount === 0) {
        return res.status(500).send("Salon not found");
      }

      const userRes = await client.query(
        `
        INSERT INTO auth_users (email, role, salon_slug, master_slug)
        VALUES ($1, 'salon_admin', $2, NULL)
        ON CONFLICT (email, role)
        DO UPDATE SET email = EXCLUDED.email
        RETURNING id
        `,
        [email.toLowerCase(), DEFAULT_SALON_SLUG]
      );

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60 * 1000);

      await client.query(
        `
        INSERT INTO auth_magic_links (user_id, token, expires_at)
        VALUES ($1, $2, $3)
        `,
        [userRes.rows[0].id, token, expiresAt]
      );

      const link =
        `${req.protocol}://${req.get("host")}` +
        `/auth/verify?token=${token}&return=${encodeURIComponent(returnUrl || "/")}`;

      console.log("[AUTH MAGIC LINK]", email, link);
      res.send("Magic link generated. Check logs.");
    } catch (err) {
      console.error("[AUTH DB ERROR]", err);
      res.status(500).json({ error: "auth_failed" });
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
      `
      SELECT id
      FROM auth_magic_links
      WHERE token = $1
        AND used_at IS NULL
        AND expires_at > now()
      LIMIT 1
      `,
      [token]
    );

    if (linkRes.rowCount === 0) {
      return res.status(400).send("Link invalid or expired");
    }

    await client.query(
      `UPDATE auth_magic_links SET used_at = now() WHERE id = $1`,
      [linkRes.rows[0].id]
    );

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
