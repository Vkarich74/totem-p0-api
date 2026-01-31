import express from "express";
import crypto from "crypto";
import { pool } from "../db/index.js";

const router = express.Router();
const MAGIC_LINK_TTL_MIN = 10;

/**
 * GET /auth
 */
router.get("/auth", (req, res) => {
  res.status(200).send("AUTH OK (DB STEP)");
});

/**
 * POST /auth/request
 */
router.post("/auth/request", async (req, res) => {
  const email = "test@example.com";
  const role = "salon_admin";

  let client;
  try {
    client = await pool.connect();

    const userRes = await client.query(
      `INSERT INTO auth_users (email, role)
       VALUES ($1, $2)
       ON CONFLICT (email, role)
       DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [email, role]
    );

    const token = crypto.randomBytes(8).toString("hex");
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60 * 1000);

    await client.query(
      `INSERT INTO auth_magic_links (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [userRes.rows[0].id, token, expiresAt]
    );

    res.json({ ok: true, step: "db_write_ok" });
  } catch (err) {
    console.error("[AUTH DB ERROR]", err);
    res.status(500).json({ error: "db_failed" });
  } finally {
    if (client) client.release();
  }
});

/**
 * GET /auth/verify
 */
router.get("/auth/verify", async (req, res) => {
  res.status(200).send("AUTH VERIFY OK (DB STEP)");
});

export default router;
