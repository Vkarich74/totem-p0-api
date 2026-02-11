import express from "express";
import crypto from "crypto";
import db from "../db.js";

const router = express.Router();

function createSession(user_id) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const expires = now + 7 * 24 * 60 * 60 * 1000;

  db.prepare(`
    INSERT INTO sessions (id, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, user_id, now, expires);

  return { id, expires_at: expires };
}

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "BAD_REQUEST" });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user || user.password !== password) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const session = createSession(user.id);

  res.cookie("totem_session", session.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  res.json({
    ok: true,
    role: user.role,
    user_id: user.id
  });
});

router.get("/auth/resolve", (req, res) => {
  const sessionId = req.cookies?.totem_session;

  if (!sessionId) {
    return res.json({ role: "public" });
  }

  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);

  if (!session || session.expires_at < Date.now()) {
    return res.json({ role: "public" });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id);

  if (!user) {
    return res.json({ role: "public" });
  }

  res.json({
    role: user.role,
    user_id: user.id,
    master_id: user.master_id,
    salon_id: user.salon_id
  });
});

export default router;
