import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import pkg from "pg";

import { resolveAuth } from "./middleware/resolveAuth.js";
import { resolveTenant } from "./middleware/resolveTenant.js";

const { Pool } = pkg;

const app = express();
app.set("trust proxy", 1);

/* ================= CORS ================= */

const allowedOrigins = [
  "https://totem-platform.odoo.com",
  "https://www.totemv.com",
  "https://totemv.com",
  "https://app.totemv.com",
  "http://localhost:5173"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);

app.use(express.json());
app.use(cookieParser());

/* ================= OBSERVABILITY ================= */

app.use((req, res, next) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();

  req.request_id = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const latency = Date.now() - start;

    const log = {
      ts: new Date().toISOString(),
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      latency_ms: latency,
      tenant_slug: req.tenant?.slug || req.params?.slug || null,
      user_id: req.auth?.user_id || null,
      ip: req.ip
    };

    console.log(JSON.stringify(log));
  });

  next();
});

/* ================= TENANT RATE LIMIT ================= */

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 100);

const tenantBuckets = new Map();

function tenantRateLimit(req, res, next) {
  const slug = req.tenant?.slug;
  if (!slug) return next();

  const now = Date.now();
  const bucket = tenantBuckets.get(slug);

  if (!bucket) {
    tenantBuckets.set(slug, { startMs: now, count: 1 });
    return next();
  }

  if (now - bucket.startMs >= RATE_LIMIT_WINDOW_MS) {
    bucket.startMs = now;
    bucket.count = 1;
    return next();
  }

  bucket.count += 1;

  if (bucket.count > RATE_LIMIT_MAX) {
    return res.status(429).json({
      ok: false,
      error: "RATE_LIMIT_EXCEEDED",
      request_id: req.request_id
    });
  }

  return next();
}

/* ================= DATABASE ================= */

let _pool = null;
function getPool() {
  if (_pool) return _pool;
  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  return _pool;
}

app.use(resolveAuth);

function requireAuth(req, res, next) {
  if (!req.auth) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }
  next();
}

/* ================= ROOT ================= */

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

/* ================= PORT ================= */

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port:", PORT);
});