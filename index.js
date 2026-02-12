import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { Pool } from "pg";
import crypto from "crypto";

const app = express();
app.set("trust proxy", 1);

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "https://totem-platform.odoo.com";

const SESSION_COOKIE = "totem_session";
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

let _pool = null;

function getPool() {
  if (_pool) return _pool;
  _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/* ================= AUTH LOAD ================= */

async function loadAuth(req, res, next) {
  try {
    const pool = getPool();
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

    if (row.role === "salon_admin") {
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
        [String(row.user_id)]
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
    console.error(err);
    req.auth = { role: "public" };
    next();
  }
}

app.use(loadAuth);

/* ================= TENANT ================= */

function requireTenant(req, res, next) {
  if (!req.auth.user_id)
    return res.status(401).json({ ok: false });

  const activeSalonId = req.query?.active_salon_id;
  if (!activeSalonId)
    return res.status(400).json({ ok: false });

  const match = req.auth.salons.find(
    s => String(s.id) === String(activeSalonId)
  );

  if (!match)
    return res.status(403).json({ ok: false });

  req.tenant = {
    salon_id: String(match.id),
    salon_slug: match.slug,
    role: req.auth.role,
    user_id: req.auth.user_id
  };

  next();
}

/* ================= MASTER INVITE ================= */

app.post("/secure/master/invite", requireTenant, async (req, res) => {
  try {
    if (req.tenant.role !== "salon_admin")
      return res.status(403).json({ ok: false });

    const pool = getPool();
    const { email } = req.body || {};
    if (!email)
      return res.status(400).json({ ok: false, error: "EMAIL_REQUIRED" });

    const cleanEmail = email.trim().toLowerCase();

    let user = await pool.query(
      "SELECT id FROM auth_users WHERE email=$1 LIMIT 1",
      [cleanEmail]
    );

    let masterId;

    if (!user.rows.length) {
      const insert = await pool.query(
        `INSERT INTO auth_users
         (email, role, enabled, created_at, salon_id)
         VALUES ($1,'master',true,now(),$2)
         RETURNING id`,
        [cleanEmail, req.tenant.salon_id]
      );
      masterId = insert.rows[0].id;
    } else {
      masterId = user.rows[0].id;

      await pool.query(
        "UPDATE auth_users SET salon_id=$1 WHERE id=$2",
        [req.tenant.salon_id, masterId]
      );
    }

    await pool.query(
      `INSERT INTO master_salon
       (master_id, salon_id, status, created_at, updated_at)
       VALUES ($1,$2,'active',now(),now())
       ON CONFLICT DO NOTHING`,
      [String(masterId), req.tenant.salon_id]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error("INVITE_ERROR:", err);
    res.status(500).json({ ok: false });
  }
});

/* ================= MASTER LIST ================= */

app.get("/secure/masters", requireTenant, async (req, res) => {
  const pool = getPool();

  const masters = await pool.query(
    `SELECT u.id, u.email
     FROM master_salon ms
     JOIN auth_users u ON u.id::text = ms.master_id
     WHERE ms.salon_id = $1`,
    [req.tenant.salon_id]
  );

  res.json({ ok: true, masters: masters.rows });
});

/* ================= HEALTH ================= */

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
