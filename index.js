import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { Pool } from "pg";
import crypto from "crypto";

const app = express();

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "https://totem-platform.odoo.com";

const SESSION_COOKIE = "totem_session";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);

app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
}));

/* =========================
   DB
========================= */

let _pool = null;

function getPool() {
  if (_pool) return _pool;
  if (!process.env.DATABASE_URL) return null;

  _pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  return _pool;
}

/* =========================
   HELPERS
========================= */

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/* =========================
   AUTH LOADER
========================= */

async function loadAuth(req, res, next) {
  try {
    const pool = getPool();
    if (!pool) {
      req.auth = { role: "public" };
      return next();
    }

    const sid = req.cookies?.[SESSION_COOKIE];
    if (!sid) {
      req.auth = { role: "public" };
      return next();
    }

    const r = await pool.query(
      `SELECT s.user_id, s.expires_at,
              u.role, u.enabled
       FROM auth_sessions s
       JOIN auth_users u ON u.id = s.user_id
       WHERE s.id = $1 LIMIT 1`,
      [sid]
    );

    if (!r.rows || r.rows.length === 0) {
      req.auth = { role: "public" };
      return next();
    }

    const row = r.rows[0];

    if (row.enabled === false ||
        !row.expires_at ||
        new Date(row.expires_at).getTime() <= Date.now()) {
      req.auth = { role: "public" };
      return next();
    }

    // 🔥 Получаем все салоны владельца
    const salons = await pool.query(
      `SELECT s.id, s.slug
       FROM owner_salon os
       JOIN salons s ON s.id = os.salon_id
       WHERE os.owner_id = $1`,
      [row.user_id]
    );

    req.auth = {
      role: row.role,
      user_id: row.user_id,
      salons: salons.rows
    };

    return next();
  } catch (err) {
    console.error("AUTH_LOAD_ERROR:", err);
    req.auth = { role: "public" };
    return next();
  }
}

app.use(loadAuth);

/* =========================
   TENANT CONTEXT
========================= */

function requireTenant(req, res, next) {
  if (!req.auth.user_id) {
    return res.status(401).json({ ok: false, error: "AUTH_REQUIRED" });
  }

  const activeSalonId = req.query?.active_salon_id;

  if (!activeSalonId) {
    return res.status(400).json({ ok: false, error: "ACTIVE_SALON_REQUIRED" });
  }

  const match = req.auth.salons.find(
    s => String(s.id) === String(activeSalonId)
  );

  if (!match) {
    return res.status(403).json({ ok: false, error: "FORBIDDEN_CROSS_SALON" });
  }

  req.tenant = {
    salon_id: String(match.id),
    salon_slug: match.slug,
    role: req.auth.role
  };

  next();
}

/* =========================
   HEALTH
========================= */

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* =========================
   AUTH LOGIN
========================= */

app.post("/auth/login", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(500).json({ ok: false });
    }

    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ ok: false, error: "EMAIL_REQUIRED" });
    }

    const u = await pool.query(
      "SELECT id, role, enabled FROM auth_users WHERE email = $1 LIMIT 1",
      [email.trim().toLowerCase()]
    );

    if (!u.rows.length) {
      return res.status(401).json({ ok: false, error: "USER_NOT_FOUND" });
    }

    const user = u.rows[0];

    if (!user.enabled) {
      return res.status(403).json({ ok: false, error: "USER_DISABLED" });
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = addDays(new Date(), SESSION_TTL_DAYS);

    await pool.query(
      "INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES ($1, $2, now(), $3)",
      [sessionId, user.id, expiresAt.toISOString()]
    );

    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "None"
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("LOGIN_ERROR:", err);
    return res.status(500).json({ ok: false });
  }
});

/* =========================
   AUTH RESOLVE
========================= */

app.get("/auth/resolve", (req, res) => {
  if (!req.auth.user_id) {
    return res.json({ role: "public" });
  }

  return res.json({
    role: req.auth.role,
    salons: req.auth.salons
  });
});

/* =========================
   PROTECTED EXAMPLE
========================= */

app.get("/secure/me", requireTenant, (req, res) => {
  res.json({
    ok: true,
    salon_id: req.tenant.salon_id,
    salon_slug: req.tenant.salon_slug
  });
});

/* =========================
   404
========================= */

app.use((req, res) => {
  return res.status(404).json({ ok: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
