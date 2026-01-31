import express from "express";
import crypto from "crypto";
import { pool } from "../db/index.js";

const router = express.Router();
const MAGIC_LINK_TTL_MIN = 10;

// v1 hard binding
const DEFAULT_SALON_SLUG = "totem-demo-salon";

/**
 * Helpers for AUTH_V2 session
 */
function base64urlEncode(buf) {
  return Buffer.from(buf).toString("base64url");
}

function signSession(payload, secret) {
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

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
 * create salon_admin WITH binding
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
 * AUTH_V2 FINAL: set ONLY signed session cookie
 */
router.get("/auth/verify", async (req, res) => {
  const { token, return: returnUrl } = req.query;
  if (!token) return res.status(400).send("Missing token");

  const client = await pool.connect();
  try {
    const linkRes = await client.query(
      `
      SELECT aml.id, au.id AS user_id
      FROM auth_magic_links aml
      JOIN auth_users au ON au.id = aml.user_id
      WHERE aml.token = $1
        AND aml.used_at IS NULL
        AND aml.expires_at > now()
      LIMIT 1
      `,
      [token]
    );

    if (linkRes.rowCount === 0) {
      return res.status(400).send("Link invalid or expired");
    }

    const { id: linkId, user_id } = linkRes.rows[0];

    await client.query(
      `UPDATE auth_magic_links SET used_at = now() WHERE id = $1`,
      [linkId]
    );

    const secret = process.env.AUTH_SESSION_SECRET;
    if (!secret) {
      console.error("[AUTH] AUTH_SESSION_SECRET missing");
      return res.status(500).send("Auth misconfigured");
    }

    const now = Math.floor(Date.now() / 1000);
    const ttlDays = Number(process.env.AUTH_SESSION_TTL_DAYS || 7);

    const payload = {
      v: 1,
      uid: user_id,
      iat: now,
      exp: now + ttlDays * 24 * 60 * 60,
    };

    const sessionValue = signSession(payload, secret);

    res.cookie("totem_sess", sessionValue, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });

    res.redirect(returnUrl || "/");
  } finally {
    client.release();
  }
});

export default router;
