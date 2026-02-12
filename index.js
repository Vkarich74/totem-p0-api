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
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  return _pool;
}

function slugifyEmail(email) {
  return email.split("@")[0] + "-" + crypto.randomUUID().slice(0, 8);
}

/* ================= JWT MIDDLEWARE ================= */

function requireMasterAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer "))
      return res.status(401).json({ ok: false, error: "TOKEN_REQUIRED" });

    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== "master")
      return res.status(403).json({ ok: false, error: "INVALID_ROLE" });

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

    res.json({ ok: true, master_id: masterInsert.rows[0].id });

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

    const token = jwt.sign(
      { master_id: master.rows[0].id, role: "master" },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ ok: true, token });

  } catch (err) {
    console.error("LOGIN_ERROR:", err);
    res.status(500).json({ ok: false });
  }
});

/* ================= ROOT (Railway healthcheck) ================= */

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

/* ================= HEALTH ================= */

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* ================= SERVER START ================= */

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Server running on port:", PORT);
});
