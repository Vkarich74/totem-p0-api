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
   DB (SAFE SINGLETON)
========================= */

let _pool = null;

function getPool() {
  if (_pool) return _pool;

  if (!process.env.DATABASE_URL) {
    // Не падаем: сервер должен стартовать всегда
    return null;
  }

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
   AUTH: LOAD SESSION
   - Reads cookie
   - Fetches auth_sessions + auth_users
   - Sets req.auth
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

    const q = `
      SELECT
        s.id as session_id,
        s.user_id,
        s.expires_at,
        u.email,
        u.role,
        u.salon_slug,
        u.master_slug,
        u.enabled
      FROM auth_sessions s
      JOIN auth_users u ON u.id = s.user_id
      WHERE s.id = $1
      LIMIT 1
    `;

    const r = await pool.query(q, [sid]);

    if (!r.rows || r.rows.length === 0) {
      req.auth = { role: "public" };
      return next();
    }

    const row = r.rows[0];

    if (row.enabled === false) {
      req.auth = { role: "public" };
      return next();
    }

    if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) {
      req.auth = { role: "public" };
      return next();
    }

    // Optional: derive salon_id if salon_slug exists
    let salon = null;
    if (row.salon_slug) {
      salon = await resolveSalonBySlug(pool, row.salon_slug);
    }

    req.auth = {
      role: row.role || "public",
      user_id: row.user_id,
      email: row.email,
      salon_slug: row.salon_slug || null,
      master_slug: row.master_slug || null,
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
   HEALTH
========================= */

app.get("/health", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(200).json({ ok: true, db: "not_configured" });
    await pool.query("SELECT 1");
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("HEALTH_ERROR:", err);
    return res.status(500).json({ ok: false });
  }
});

/* =========================
   AUTH LOGIN (REAL)
   Contract:
   - user must exist in auth_users
   - creates row in auth_sessions
   - cookie value = session_id
========================= */

app.post("/auth/login", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(500).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });
    }

    const { email } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ ok: false, error: "EMAIL_REQUIRED" });
    }

    const u = await pool.query(
      "SELECT id, email, role, salon_slug, master_slug, enabled FROM auth_users WHERE email = $1 LIMIT 1",
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

    // Optional: derive salon_id for frontend
    let salon = null;
    if (user.salon_slug) {
      salon = await resolveSalonBySlug(pool, user.salon_slug);
    }

    return res.json({
      ok: true,
      role: user.role,
      salon_slug: user.salon_slug || null,
      master_slug: user.master_slug || null,
      salon_id: salon ? salon.salon_id : null
    });
  } catch (err) {
    console.error("AUTH_LOGIN_ERROR:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

/* =========================
   AUTH RESOLVE (REAL)
========================= */

app.get("/auth/resolve", (req, res) => {
  const a = req.auth || { role: "public" };

  if (!a.user_id) {
    return res.json({ role: "public" });
  }

  return res.json({
    role: a.role || "public",
    salon_slug: a.salon_slug || null,
    master_slug: a.master_slug || null,
    salon_id: a.salon_id || null
  });
});

/* =========================
   SLUG RESOLVE (PUBLIC)
========================= */

app.get("/s/:slug/resolve", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(500).json({ ok: false, error: "DATABASE_NOT_CONFIGURED" });
    }

    const { slug } = req.params;

    const salon = await resolveSalonBySlug(pool, slug);
    if (!salon) {
      return res.status(404).json({ ok: false, error: "SALON_NOT_FOUND" });
    }

    return res.json({ ok: true, salon_id: salon.salon_id, slug: salon.slug });
  } catch (err) {
    console.error("SLUG_RESOLVE_ERROR:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

/* =========================
   GLOBAL JSON 404
========================= */

app.use((req, res) => {
  return res.status(404).json({ ok: false, error: "NOT_FOUND" });
});

/* =========================
   START
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
