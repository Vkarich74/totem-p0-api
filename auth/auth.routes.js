import express from "express";
import crypto from "crypto";
import db from "../db.js";

const router = express.Router();

function newId() {
  return crypto.randomUUID();
}

function nowMs() {
  return Date.now();
}

function msToIso(ms) {
  return new Date(ms).toISOString();
}

async function createSession(user_id) {
  const id = newId();
  const expiresMs = nowMs() + 7 * 24 * 60 * 60 * 1000; // 7 days

  if (db.mode === "POSTGRES") {
    await db.run(
      `
      INSERT INTO auth_sessions (id, user_id, expires_at)
      VALUES ($1, $2, $3::timestamptz)
      `,
      [id, user_id, msToIso(expiresMs)]
    );
  } else {
    await db.run(
      `
      INSERT INTO auth_sessions (id, user_id, expires_at)
      VALUES (?, ?, ?)
      `,
      [id, user_id, msToIso(expiresMs)]
    );
  }

  return { id, expiresMs };
}

async function getUserByEmail(email) {
  const sql =
    db.mode === "POSTGRES"
      ? `SELECT id, email, password, role, master_id, salon_id FROM auth_users WHERE email=$1 LIMIT 1`
      : `SELECT id, email, password, role, master_id, salon_id FROM auth_users WHERE email=? LIMIT 1`;

  return db.get(sql, [email]);
}

async function getSession(sessionId) {
  const sql =
    db.mode === "POSTGRES"
      ? `SELECT id, user_id, expires_at FROM auth_sessions WHERE id=$1 LIMIT 1`
      : `SELECT id, user_id, expires_at FROM auth_sessions WHERE id=? LIMIT 1`;

  return db.get(sql, [sessionId]);
}

async function deleteSession(sessionId) {
  const sql = db.mode === "POSTGRES"
    ? `DELETE FROM auth_sessions WHERE id=$1`
    : `DELETE FROM auth_sessions WHERE id=?`;

  await db.run(sql, [sessionId]);
}

async function getUserById(userId) {
  const sql =
    db.mode === "POSTGRES"
      ? `SELECT id, role, master_id, salon_id FROM auth_users WHERE id=$1 LIMIT 1`
      : `SELECT id, role, master_id, salon_id FROM auth_users WHERE id=? LIMIT 1`;

  return db.get(sql, [userId]);
}

// POST /auth/login
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "BAD_REQUEST" });

    const user = await getUserByEmail(String(email));
    if (!user || String(user.password) !== String(password)) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    }

    const session = await createSession(String(user.id));

    res.cookie("totem_session", session.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    return res.status(200).json({ ok: true, role: user.role, user_id: user.id });
  } catch (e) {
    console.error("[AUTH_LOGIN][ERROR]", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// POST /auth/logout
router.post("/auth/logout", async (req, res) => {
  try {
    const sid = req.cookies?.totem_session;
    if (sid) {
      try { await deleteSession(String(sid)); } catch (_) {}
    }
    res.clearCookie("totem_session", { path: "/" });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[AUTH_LOGOUT][ERROR]", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// GET /auth/resolve
router.get("/auth/resolve", async (req, res) => {
  try {
    const sid = req.cookies?.totem_session;
    if (!sid) return res.status(200).json({ role: "public" });

    const session = await getSession(String(sid));
    if (!session) return res.status(200).json({ role: "public" });

    const expMs = Date.parse(String(session.expires_at));
    if (!Number.isFinite(expMs) || expMs < nowMs()) {
      try { await deleteSession(String(sid)); } catch (_) {}
      return res.status(200).json({ role: "public" });
    }

    const user = await getUserById(String(session.user_id));
    if (!user) return res.status(200).json({ role: "public" });

    if (user.role === "master") {
      return res.status(200).json({
        role: "master",
        master_id: user.master_id,
        salon_ids: user.salon_id ? [user.salon_id] : [],
        permissions: {
          can_edit_profile: true,
          can_manage_schedule: true,
        },
      });
    }

    if (user.role === "salon") {
      return res.status(200).json({
        role: "salon",
        salon_id: user.salon_id,
        permissions: {
          can_manage_masters: true,
          can_view_reports: true,
        },
      });
    }

    if (user.role === "owner") {
      return res.status(200).json({
        role: "owner",
        owner_id: user.id,
        permissions: {},
      });
    }

    return res.status(200).json({ role: "public" });
  } catch (e) {
    console.error("[AUTH_RESOLVE][ERROR]", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

export default router;
