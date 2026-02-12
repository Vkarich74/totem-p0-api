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

function slugifyEmail(email) {
  return email.split("@")[0] + "-" + crypto.randomUUID().slice(0,8);
}

/* ================= MASTER INVITE ================= */

app.post("/secure/master/invite", async (req, res) => {
  try {
    const pool = getPool();
    const { email } = req.body || {};
    const activeSalonId = req.query?.active_salon_id;

    if (!email)
      return res.status(400).json({ ok: false, error: "EMAIL_REQUIRED" });

    const cleanEmail = email.trim().toLowerCase();
    const masterSlug = slugifyEmail(cleanEmail);

    let user = await pool.query(
      "SELECT id FROM auth_users WHERE email=$1 LIMIT 1",
      [cleanEmail]
    );

    let masterId;

    if (!user.rows.length) {
      const insert = await pool.query(
        `INSERT INTO auth_users
         (email, role, enabled, created_at, master_slug)
         VALUES ($1,'master',true,now(),$2)
         RETURNING id`,
        [cleanEmail, masterSlug]
      );
      masterId = insert.rows[0].id;
    } else {
      masterId = user.rows[0].id;
    }

    await pool.query(
      `INSERT INTO master_salon
       (master_id, salon_id, status, created_at, updated_at)
       VALUES ($1,$2,'active',now(),now())
       ON CONFLICT DO NOTHING`,
      [String(masterId), String(activeSalonId)]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error("INVITE_ERROR:", err);
    res.status(500).json({ ok: false });
  }
});

/* ================= MASTER LIST ================= */

app.get("/secure/masters", async (req, res) => {
  const pool = getPool();
  const activeSalonId = req.query?.active_salon_id;

  const masters = await pool.query(
    `SELECT u.id, u.email
     FROM master_salon ms
     JOIN auth_users u ON u.id::text = ms.master_id
     WHERE ms.salon_id = $1`,
    [String(activeSalonId)]
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
