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

    if (!r.rows.length) {
      req.auth = { role: "public" };
      return next();
    }

    const row = r.rows[0];

    if (!row.enabled ||
        !row.expires_at ||
        new Date(row.expires_at).getTime() <= Date.now()) {
      req.auth = { role: "public" };
      return next();
    }

    let salons = [];

    if (row.role === "owner") {
      const result = await pool.query(
        `SELECT s.id, s.slug
         FROM owner_salon os
         JOIN salons s ON s.id = os.salon_id
         WHERE os.owner_id = $1`,
        [row.user_id]
      );
      salons = result.rows;
    }

    if (row.role === "master") {
      const result = await pool.query(
        `SELECT s.id, s.slug
         FROM master_salon ms
         JOIN salons s ON s.id = ms.salon_id
         WHERE ms.master_id = $1`,
        [row.user_id]
      );
      salons = result.rows;
    }

    req.auth = {
      user_id: row.user_id,
      role: row.role,
      salons
    };

    next();
  } catch (err) {
    console.error("AUTH_LOAD_ERROR:", err);
    req.auth = { role: "public" };
    next();
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
    role: req.auth.role,
    user_id: req.auth.user_id
  };

  next();
}

/* =========================
   AUTH
========================= */

app.post("/auth/login", async (req, res) => {
  try {
    const pool = getPool();
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ ok: false });
    }

    const u = await pool.query(
      "SELECT id, role, enabled FROM auth_users WHERE email=$1 LIMIT 1",
      [email.trim().toLowerCase()]
    );

    if (!u.rows.length || !u.rows[0].enabled) {
      return res.status(401).json({ ok: false });
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = addDays(new Date(), SESSION_TTL_DAYS);

    await pool.query(
      "INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES ($1,$2,now(),$3)",
      [sessionId, u.rows[0].id, expiresAt.toISOString()]
    );

    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "None"
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

app.get("/auth/resolve", (req, res) => {
  if (!req.auth.user_id) {
    return res.json({ role: "public" });
  }

  res.json({
    role: req.auth.role,
    salons: req.auth.salons
  });
});

/* =========================
   MASTER TEST ENDPOINT
========================= */

app.get("/secure/masters", requireTenant, async (req, res) => {
  const pool = getPool();

  const masters = await pool.query(
    `SELECT u.id, u.email
     FROM master_salon ms
     JOIN auth_users u ON u.id = ms.master_id
     WHERE ms.salon_id = $1`,
    [req.tenant.salon_id]
  );

  res.json({ ok: true, masters: masters.rows });
});

/* =========================
   HEALTH
========================= */

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* =========================
   404
========================= */

app.use((req, res) => {
  res.status(404).json({ ok: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
