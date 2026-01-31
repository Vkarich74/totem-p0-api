import express from "express";
import crypto from "crypto";
import { pool } from "../db/index.js";

const router = express.Router();

/**
 * POST /auth/request
 * Generates magic link with LONG TTL and HTTPS URL
 */
router.post("/auth/request", async (req, res) => {
  const { email, role, salon_slug, master_slug } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `
      INSERT INTO auth_users (email, role, salon_slug, master_slug, enabled)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (email, role)
      DO UPDATE SET enabled = true
      RETURNING id
      `,
      [email, role, salon_slug || null, master_slug || null]
    );

    const user_id = userResult.rows[0].id;

    const token = crypto.randomBytes(32).toString("hex");
    const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 HOURS

    // allow reusing token until TTL
    await client.query(
      `
      INSERT INTO auth_magic_links (user_id, token, expires_at, used_at)
      VALUES ($1, $2, $3, NULL)
      `,
      [user_id, token, expires_at]
    );

    const verifyUrl =
      `https://totem-p0-api-production.up.railway.app/auth/verify` +
      `?token=${token}&return=/`;

    console.log("[AUTH MAGIC LINK]", email, verifyUrl);

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("AUTH_REQUEST_ERROR", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  } finally {
    client.release();
  }
});

/**
 * GET /auth/verify
 * Sets session cookie. Token reusable until expires_at.
 */
router.get("/auth/verify", async (req, res) => {
  const { token, return: returnPath } = req.query;

  if (!token) {
    return res.status(400).send("Missing token");
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      SELECT user_id
      FROM auth_magic_links
      WHERE token = $1
        AND expires_at > now()
      `,
      [token]
    );

    if (result.rowCount === 0) {
      return res.status(400).send("Link invalid or expired");
    }

    const { user_id } = result.rows[0];

    const payload = Buffer.from(
      JSON.stringify({ v: 1, uid: user_id, iat: Date.now() })
    ).toString("base64");

    const secret = process.env.AUTH_SESSION_SECRET || "dev-secret";
    const sig = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    res.cookie("totem_sess", `${payload}.${sig}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: true, // HTTPS ONLY
      path: "/",
    });

    res.redirect(returnPath || "/");
  } catch (err) {
    console.error("AUTH_VERIFY_ERROR", err);
    res.status(500).send("INTERNAL_ERROR");
  } finally {
    client.release();
  }
});

export default router;
