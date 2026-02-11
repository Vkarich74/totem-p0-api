import express from "express";
import crypto from "crypto";
import db from "../db.js";

const router = express.Router();

/*
  LOGIN:
  - проверяет только email
  - проверяет enabled=true
  - password игнорируется (тестовый режим)
*/
router.post("/login", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "EMAIL_REQUIRED" });
    }

    const user = await db.get(
      `SELECT id, email, role, salon_slug, master_slug, enabled
       FROM auth_users
       WHERE email=$1
       LIMIT 1`,
      [email]
    );

    if (!user) {
      return res.status(401).json({ error: "USER_NOT_FOUND" });
    }

    if (!user.enabled) {
      return res.status(403).json({ error: "USER_DISABLED" });
    }

    const sessionId = crypto.randomUUID();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.run(
      `
      INSERT INTO auth_sessions (id, user_id, expires_at)
      VALUES ($1,$2,$3)
      `,
      [sessionId, user.id, expires]
    );

    res.cookie("totem_session", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: true
    });

    return res.json({
      ok: true,
      role: user.role,
      salon_slug: user.salon_slug,
      master_slug: user.master_slug
    });

  } catch (e) {
    console.error("[AUTH_LOGIN_ERROR]", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

/*
  RESOLVE:
*/
router.get("/resolve", async (req, res) => {
  try {
    const sessionId = req.cookies?.totem_session;

    if (!sessionId) {
      return res.json({ role: "public" });
    }

    const session = await db.get(
      `
      SELECT s.id, u.role, u.salon_slug, u.master_slug
      FROM auth_sessions s
      JOIN auth_users u ON u.id = s.user_id
      WHERE s.id=$1
      LIMIT 1
      `,
      [sessionId]
    );

    if (!session) {
      return res.json({ role: "public" });
    }

    return res.json({
      role: session.role,
      salon_slug: session.salon_slug,
      master_slug: session.master_slug
    });

  } catch (e) {
    console.error("[AUTH_RESOLVE_ERROR]", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
