import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { Pool } from "pg";
import crypto from "crypto";

const app = express();

/* =========================
   CONFIG
========================= */

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "https://totem-platform.odoo.com";

const SESSION_COOKIE = "totem_session";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);

/* =========================
   MIDDLEWARES
========================= */

app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: true
}));

app.options("*", cors({
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

async function resolveSalonBySlug(pool, slug) {
  const r = await pool.query(
    "SELECT id, slug FROM salons WHERE slug = $1 LIMIT 1",
    [slug]
  );
  if (!r.rows || r.rows.length === 0) return null;
  return { salon_id: String(r.rows[0].id), slug: r.rows[0].slug };
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
              u.role, u.salon_slug, u.master_slug, u.enabled
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

    let salon = null;
    if (row.salon_slug) {
      salon = await resolveSalonBySlug(pool, row.salon_slug);
    }

    req.auth = {
      role: row.role,
      user_id: row.user_id,
      salon_slug: row.salon_slug,
      master_slug: row.master_slug,
      salon_id: salon ? salon.salon_id : null
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
   TENANT CONTEXT (HARD MODE)
========================= */

function requireTenant(req, res, next) {
  if (!req.auth || !req.auth.user_id) {
    return res.status(401).json({ ok: false, error: "AUTH_REQUIRED" });
  }

  if (!req.auth.salon_id) {
    return res.status(403).json({ ok: false, error: "TENANT_NOT_BOUND" });
  }

  // 🔒 Единственный источник salon_id — сессия
  req.tenant = {
    salon_id: String(req.auth.salon_id),
    role: req.auth.role
  };

  return next();
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
      return res.status(500).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });
    }

    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ ok: false, error: "EMAIL_REQUIRED" });
    }

    const u = await pool.query(
      "SELECT id, role, salon_slug, master_slug, enabled FROM auth_users WHERE email = $1 LIMIT 1",
      [email.trim().toLowerCase()]
    );

    if (!u.rows || u.rows.length === 0) {
      return res.status(401).json({ ok: false, error: "USER_NOT_FOUND" });
    }

    const user = u.rows[0];

    if (user.enabled === false) {
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

    return res.json({
      ok: true,
      role: user.role,
      salon_slug: user.salon_slug,
      master_slug: user.master_slug
    });
  } catch (err) {
    console.error("AUTH_LOGIN_ERROR:", err);
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
    salon_slug: req.auth.salon_slug,
    master_slug: req.auth.master_slug,
    salon_id: req.auth.salon_id
  });
});

/* =========================
   PROTECTED EXAMPLE (NO salon_id param)
========================= */

app.get("/secure/me", requireTenant, async (req, res) => {
  return res.json({
    ok: true,
    salon_id: req.tenant.salon_id,
    role: req.tenant.role
  });
});

/* =========================
   SLUG RESOLVE (PUBLIC)
========================= */

app.get("/s/:slug/resolve", async (req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(500).json({ ok: false });
  }

  const salon = await resolveSalonBySlug(pool, req.params.slug);
  if (!salon) {
    return res.status(404).json({ ok: false });
  }

  return res.json({ ok: true, salon_id: salon.salon_id, slug: salon.slug });
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
