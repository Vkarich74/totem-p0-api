import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { Pool } from "pg";
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const app = express();
app.set("trust proxy", 1);

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "https://totem-platform.odoo.com";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET missing");
  process.exit(1);
}

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
  return email.split("@")[0] + "-" + crypto.randomUUID().slice(0, 8);
}

/* ================= JWT MIDDLEWARE ================= */

function requireMasterAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "TOKEN_REQUIRED" });
    }

    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== "master") {
      return res.status(403).json({ ok: false, error: "INVALID_ROLE" });
    }

    req.master = decoded;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
  }
}

/* ================= MASTER REGISTER ================= */

app.post("/master/register", async (req, res) => {
  try {
    const pool = getPool();
    const { email, password, name } = req.body || {};

    if (!email || !password || !name)
      return res.status(400).json({ ok: false, error: "EMAIL_PASSWORD_NAME_REQUIRED" });

    const cleanEmail = email.trim().toLowerCase();

    const existing = await pool.query(
      "SELECT id FROM auth_users WHERE email=$1 AND role='master'",
      [cleanEmail]
    );

    if (existing.rows.length)
      return res.status(400).json({ ok: false, error: "MASTER_EXISTS" });

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const masterSlug = slugifyEmail(cleanEmail);

    const userInsert = await pool.query(
      `INSERT INTO auth_users
       (email, role, enabled, created_at, master_slug, password_hash)
       VALUES ($1,'master',true,now(),$2,$3)
       RETURNING id`,
      [cleanEmail, masterSlug, password_hash]
    );

    const userId = userInsert.rows[0].id;

    const masterInsert = await pool.query(
      `INSERT INTO masters
       (slug, name, user_id, created_at)
       VALUES ($1,$2,$3,now())
       RETURNING id`,
      [masterSlug, name, userId]
    );

    res.json({
      ok: true,
      master_id: masterInsert.rows[0].id
    });

  } catch (err) {
    console.error("REGISTER_ERROR:", err);
    res.status(500).json({ ok: false });
  }
});

/* ================= MASTER LOGIN ================= */

app.post("/master/login", async (req, res) => {
  try {
    const pool = getPool();
    const { email, password } = req.body || {};

    if (!email || !password)
      return res.status(400).json({ ok: false, error: "EMAIL_PASSWORD_REQUIRED" });

    const cleanEmail = email.trim().toLowerCase();

    const user = await pool.query(
      `SELECT id, password_hash, enabled
       FROM auth_users
       WHERE email=$1 AND role='master'
       LIMIT 1`,
      [cleanEmail]
    );

    if (!user.rows.length)
      return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });

    const row = user.rows[0];

    if (!row.enabled)
      return res.status(403).json({ ok: false, error: "ACCOUNT_DISABLED" });

    const valid = await bcrypt.compare(password, row.password_hash);

    if (!valid)
      return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });

    const master = await pool.query(
      "SELECT id FROM masters WHERE user_id=$1 LIMIT 1",
      [row.id]
    );

    if (!master.rows.length)
      return res.status(500).json({ ok: false, error: "MASTER_PROFILE_MISSING" });

    const masterId = master.rows[0].id;

    const token = jwt.sign(
      { master_id: masterId, role: "master" },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ ok: true, token });

  } catch (err) {
    console.error("LOGIN_ERROR:", err);
    res.status(500).json({ ok: false });
  }
});

/* ================= MASTER PROFILE ================= */

app.get("/master/profile", requireMasterAuth, async (req, res) => {
  const pool = getPool();

  const master = await pool.query(
    `SELECT m.id, m.name, u.email
     FROM masters m
     JOIN auth_users u ON u.id = m.user_id
     WHERE m.id=$1`,
    [req.master.master_id]
  );

  res.json({ ok: true, master: master.rows[0] });
});

/* ================= MASTER INVITE ================= */

app.post("/secure/master/invite", async (req, res) => {
  try {
    const pool = getPool();
    const { master_id, salon_id } = req.body || {};

    if (!master_id || !salon_id)
      return res.status(400).json({ ok: false, error: "MASTER_ID_SALON_ID_REQUIRED" });

    await pool.query(
      `INSERT INTO master_salon
       (master_id, salon_id, status, created_at, updated_at)
       VALUES ($1,$2,'active',now(),now())
       ON CONFLICT (master_id, salon_id) DO NOTHING`,
      [master_id, salon_id]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error("INVITE_ERROR:", err);
    res.status(500).json({ ok: false });
  }
});

/* ================= CREATE BOOKING ================= */

app.post("/booking/create", requireMasterAuth, async (req, res) => {
  try {
    const pool = getPool();
    const {
      salon_id,
      client_name,
      client_phone,
      client_email,
      start_at,
      end_at,
      calendar_slot_id
    } = req.body;

    const master_id = req.master.master_id;

    if (!salon_id || !client_name || !start_at || !end_at || !calendar_slot_id)
      return res.status(400).json({ ok: false, error: "missing_fields" });

    const ms = await pool.query(
      `SELECT 1 FROM master_salon
       WHERE master_id=$1 AND salon_id=$2`,
      [master_id, salon_id]
    );

    if (!ms.rows.length)
      return res.status(403).json({ ok: false, error: "master_not_in_salon" });

    let client = await pool.query(
      `SELECT id FROM clients
       WHERE salon_id=$1 AND phone=$2 LIMIT 1`,
      [salon_id, client_phone || null]
    );

    let clientId;

    if (!client.rows.length) {
      const insertClient = await pool.query(
        `INSERT INTO clients
         (salon_id,name,phone,email)
         VALUES ($1,$2,$3,$4)
         RETURNING id`,
        [salon_id, client_name, client_phone || null, client_email || null]
      );
      clientId = insertClient.rows[0].id;
    } else {
      clientId = client.rows[0].id;
    }

    const overlap = await pool.query(
      `SELECT id FROM bookings
       WHERE master_id=$1
       AND salon_id=$2
       AND tstzrange(start_at,end_at) &&
           tstzrange($3::timestamptz,$4::timestamptz)`,
      [master_id, salon_id, start_at, end_at]
    );

    if (overlap.rows.length)
      return res.status(409).json({ ok: false, error: "time_overlap" });

    const requestId = crypto.randomUUID();

    const insertBooking = await pool.query(
      `INSERT INTO bookings
       (salon_id,master_id,client_id,start_at,end_at,status,request_id,calendar_slot_id)
       VALUES ($1,$2,$3,$4,$5,'reserved',$6,$7)
       RETURNING id`,
      [salon_id, master_id, clientId, start_at, end_at, requestId, calendar_slot_id]
    );

    res.json({ ok: true, booking_id: insertBooking.rows[0].id });

  } catch (err) {
    console.error("BOOKING_CREATE_ERROR:", err);
    res.status(500).json({ ok: false });
  }
});

/* ================= HEALTH ================= */

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
