import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import Redis from "ioredis";

import { resolveTenant } from "./middleware/resolveTenant.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { pool } from "./db.js";
import { publicCreateBooking } from "./routes/publicCreateBooking.js";
import { publicMasterAvailability } from "./routes/publicAvailability.js";
import { expireReservedBookings } from "./jobs/expireReserved.js";

const app = express();
app.set("trust proxy", 1);

/* ================= REDIS CONNECTIVITY ================= */

let redis = null;

if (process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    redis.on("connect", () => {
      console.log("REDIS_CONNECTED");
    });

    redis.on("error", (err) => {
      console.error("REDIS_ERROR", err.message);
    });

    redis.ping().then((pong) => {
      console.log("REDIS_PING =", pong);
    }).catch((err) => {
      console.error("REDIS_PING_FAILED", err.message);
    });

  } catch (e) {
    console.error("REDIS_BOOT_ERROR", e.message);
  }
}

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
      if (allowedOrigins.includes(origin)) return callback(null, true);
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
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      latency_ms: latency
    }));
  });

  next();
});

/* ================= RATE LIMIT ================= */

function intEnv(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

const RL_WINDOW_MS = intEnv("RATE_LIMIT_WINDOW_MS", 60000);

const rlPublicRead = rateLimit({
  windowMs: RL_WINDOW_MS,
  max: intEnv("RATE_LIMIT_PUBLIC_READ_MAX", 120),
  keyPrefix: "pub_read",
  keyFn: (req) => `pub_read:${req.ip}:${req.params?.slug ?? "na"}`
});

const rlAvailability = rateLimit({
  windowMs: RL_WINDOW_MS,
  max: intEnv("RATE_LIMIT_AVAILABILITY_MAX", 60),
  keyPrefix: "availability",
  keyFn: (req) =>
    `availability:${req.ip}:${req.params?.slug ?? "na"}:${req.params?.master_id ?? "na"}`
});

const rlBookingCreate = rateLimit({
  windowMs: RL_WINDOW_MS,
  max: intEnv("RATE_LIMIT_BOOKING_CREATE_MAX", 20),
  keyPrefix: "booking_create",
  keyFn: (req) => `booking_create:${req.ip}:${req.params?.slug ?? "na"}`
});

/* ================= ROOT ================= */

app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

/* ================= PUBLIC SALON ================= */

app.get("/public/salons/:slug", rlPublicRead, resolveTenant, async (req, res) => {
  try {
    const { salon_id } = req.tenant;

    const { rows } = await pool.query(
      `SELECT id, slug, name, slogan, enabled, status, description,
              logo_url, cover_url, city, phone
       FROM salons
       WHERE id = $1`,
      [salon_id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false });
    }

    return res.json({ ok: true, salon: rows[0] });

  } catch (err) {
    console.error("PUBLIC_SALON_ERROR", err.message);
    return res.status(500).json({ ok: false });
  }
});

/* ================= METRICS ================= */

app.get("/public/salons/:slug/metrics", rlPublicRead, resolveTenant, async (req, res) => {
  try {
    const { salon_id } = req.tenant;

    const bookingsRes = await pool.query(
      `SELECT COUNT(*)::int AS bookings_count
       FROM bookings
       WHERE salon_id = $1`,
      [salon_id]
    );

    const bookings_count = bookingsRes.rows[0]?.bookings_count ?? 0;

    return res.json({
      ok: true,
      metrics: { bookings_count }
    });

  } catch (err) {
    console.error("METRICS_ERROR", err.message);
    return res.status(500).json({ ok: false });
  }
});

/* ================= BOOKING ================= */

app.post(
  "/public/salons/:slug/bookings",
  rlBookingCreate,
  resolveTenant,
  publicCreateBooking
);

/* ================= AVAILABILITY ================= */

app.get(
  "/public/salons/:slug/masters/:master_id/availability",
  rlAvailability,
  resolveTenant,
  publicMasterAvailability
);

/* ================= TTL ENGINE ================= */

console.log("ENABLE_TTL =", process.env.ENABLE_TTL);

if (process.env.ENABLE_TTL === "true") {
  console.log("TTL ENGINE ENABLED");
  setInterval(() => {
    expireReservedBookings();
  }, 60000);
}

/* ================= PORT ================= */

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port:", PORT);
});