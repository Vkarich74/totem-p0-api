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
  const user_id = rawId ? Number.parseInt(rawId?.toString(), 10) : null;
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

/* ================= ROOT HEALTH (ВАЖНО) ================= */

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

/* ================= HEALTH ================= */

app.get("/health", (req, res) => res.json({ ok: true }));

/* ================= BOOKING ROUTE ================= */

app.post("/bookings/v2", requireAuth, async (req, res) => {
  return res.status(200).json({ ok: true, route: "BOOKING_ACTIVE" });
});

/* ================= GLOBAL ERROR ================= */

app.use((err, req, res, next) => {
  console.error("GLOBAL_ERROR", err?.message);
  return res.status(500).json({ ok: false, error: "INTERNAL_SERVER_ERROR" });
});

/* ================= PORT ================= */

const PORT = 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port:", PORT);
});