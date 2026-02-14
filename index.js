import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pkg from "pg";

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

  if (
    Number.isInteger(user_id) &&
    user_id > 0 &&
    (role === "salon_admin" || role === "master")
  ) {
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

app.use(resolveAuth);

/* ================= HEALTH ================= */

app.get("/health", (req, res) => res.json({ ok: true }));

/* ================= INTEGRITY HEALTH ================= */

app.get("/integrity/health", async (req, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const r = await client.query(`
      SELECT COUNT(*)::int AS violations
      FROM public.v_financial_integrity_check
    `);
    const violations = r.rows[0].violations;

    if (violations === 0) {
      return res.json({
        ok: true,
        status: "ok",
        integrity_rows: 0,
        checked_at: new Date().toISOString()
      });
    }

    return res.status(500).json({
      ok: false,
      status: "broken",
      integrity_rows: violations,
      checked_at: new Date().toISOString()
    });

  } catch {
    return res.status(500).json({
      ok: false,
      status: "error",
      error: "INTEGRITY_CHECK_FAILED"
    });
  } finally {
    client.release();
  }
});

/* ================= BOOKING ROUTE ================= */

app.post("/bookings/v2", requireAuth, async (req, res, next) => {
  try {
    return res.status(200).json({ ok: true, route: "BOOKING_ACTIVE" });
  } catch (err) {
    next(err);
  }
});

/* ================= INTEGRITY WATCHDOG ================= */

async function runIntegrityCheck() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const r = await client.query(`
      SELECT COUNT(*)::int AS violations
      FROM public.v_financial_integrity_check
    `);
    const violations = r.rows[0].violations;

    if (violations > 0) {
      console.error("CRITICAL_INTEGRITY_VIOLATION", violations);
    }

  } catch (err) {
    console.error("INTEGRITY_WATCHDOG_DB_ERROR", err?.message);
  } finally {
    client.release();
  }
}

setInterval(runIntegrityCheck, 60000);

/* ================= 409 SPIKE MONITOR ================= */

let conflictCounter = 0;

setInterval(() => {
  if (conflictCounter > 10) {
    console.error("CRITICAL_409_SPIKE", {
      count: conflictCounter,
      window_seconds: 60,
      timestamp: new Date().toISOString()
    });
  }
  conflictCounter = 0;
}, 60000);

/* ================= FINANCIAL ANOMALY MONITOR ================= */

async function runFinancialAnomalyCheck() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const r = await client.query(`
      SELECT *
      FROM public.v_financial_integrity_check
      LIMIT 20
    `);

    if (r.rowCount > 0) {
      console.error("CRITICAL_FINANCIAL_ANOMALY", {
        count: r.rowCount,
        sample: r.rows,
        timestamp: new Date().toISOString()
      });
    }

  } catch (err) {
    console.error("FINANCIAL_MONITOR_DB_ERROR", err?.message);
  } finally {
    client.release();
  }
}

setInterval(runFinancialAnomalyCheck, 60000);

/* ================= GLOBAL ERROR MONITOR ================= */

app.use((err, req, res, next) => {
  if (err?.code === "23505") {
    conflictCounter++;
    return res.status(409).json({ ok: false, error: "DB_CONFLICT" });
  }

  console.error("GLOBAL_ERROR", {
    message: err?.message,
    path: req?.path,
    method: req?.method,
    timestamp: new Date().toISOString()
  });

  return res.status(500).json({ ok: false, error: "INTERNAL_SERVER_ERROR" });
});

/* ================= PORT ================= */

const PORT = 8080;
app.listen(PORT, () => {
  console.log("Server running on port:", PORT);
});
