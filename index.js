import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pkg from "pg";
import crypto from "crypto";

const { Pool } = pkg;

const app = express();
app.set("trust proxy", 1);

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "https://totem-platform.odoo.com";

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

/* ================= AUTH CONTEXT ================= */

function resolveAuth(req, res, next) {
  const rawId = req.headers["x-user-id"];
  const rawRole = req.headers["x-role"];
  const user_id = rawId ? Number.parseInt(rawId.toString(), 10) : null;
  const role = rawRole ? rawRole.toString().trim() : null;

  if (Number.isInteger(user_id) && user_id > 0 && (role === "salon_admin" || role === "master")) {
    req.auth = { user_id, role };
  } else {
    req.auth = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.auth) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  next();
}

function requireRole(roles) {
  const set = new Set(roles);
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    if (!set.has(req.auth.role)) return res.status(403).json({ ok: false, error: "FORBIDDEN" });
    next();
  };
}

async function canAccessSalon(client, user_id, role, salon_id) {
  if (!Number.isInteger(salon_id) || salon_id <= 0) return false;

  if (role === "salon_admin") {
    const q = `
      SELECT 1
      FROM public.owner_salon os
      WHERE os.owner_id = $1::text
        AND os.salon_id = $2
        AND os.status = 'active'
      LIMIT 1
    `;
    const r = await client.query(q, [user_id, salon_id]);
    return r.rowCount > 0;
  }

  if (role === "master") {
    const q = `
      SELECT 1
      FROM public.masters m
      JOIN public.master_salon ms ON ms.master_id = m.id
      WHERE m.user_id = $1
        AND ms.salon_id = $2
        AND ms.status = 'active'
      LIMIT 1
    `;
    const r = await client.query(q, [user_id, salon_id]);
    return r.rowCount > 0;
  }

  return false;
}

function requireSalonAccessFromParam(paramName) {
  return async (req, res, next) => {
    const salon_id = Number.parseInt((req.params[paramName] || "").toString(), 10);
    if (!req.auth) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

    const pool = getPool();
    const client = await pool.connect();
    try {
      const ok = await canAccessSalon(client, req.auth.user_id, req.auth.role, salon_id);
      if (!ok) return res.status(403).json({ ok: false, error: "SALON_ACCESS_DENIED" });
      next();
    } catch (e) {
      console.error("SALON_ACCESS_CHECK_ERROR:", e);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    } finally {
      client.release();
    }
  };
}

app.use(resolveAuth);

/* ================= ROUTES ================= */

app.get("/auth/resolve", (req, res) => {
  res.json({ ok: true, auth: req.auth });
});

app.get("/owner/ping", requireAuth, requireRole(["salon_admin"]), (req, res) => {
  res.json({ ok: true, user_id: req.auth.user_id, role: req.auth.role });
});

app.get("/owner/salons/:salonId/ping",
  requireAuth,
  requireRole(["salon_admin"]),
  requireSalonAccessFromParam("salonId"),
  (req, res) => {
    res.json({ ok: true, salon_id: Number.parseInt(req.params.salonId, 10) });
  }
);

app.get("/master/salons/:salonId/ping",
  requireAuth,
  requireRole(["master"]),
  requireSalonAccessFromParam("salonId"),
  (req, res) => {
    res.json({ ok: true, salon_id: Number.parseInt(req.params.salonId, 10) });
  }
);

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

const PORT = 8080;
app.listen(PORT, () => {
  console.log("Server running on port:", PORT);
});
