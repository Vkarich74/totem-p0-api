import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import Redis from "ioredis";

import { pool } from "./db.js";

import { resolveTenant } from "./middleware/resolveTenant.js";
import { resolveAuth } from "./middleware/resolveAuth.js";
import { rateLimit } from "./middleware/rateLimit.js";

import { createPublicRouter } from "./routes/public.js";
import { createInternalRouter } from "./routes/internal.js";
import { initializeSlugReservationLayer } from "./services/provision/slugReservation.js";

/* ================= REDIS ================= */

let redis = null;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  redis.on("connect", () => {
    console.log("REDIS_CONNECTED");
  });

  redis.on("ready", () => {
    console.log("REDIS_READY");
  });

  redis.on("error", (err) => {
    console.error("REDIS_ERROR", err);
  });

  redis.on("close", () => {
    console.warn("REDIS_CLOSED");
  });
} else {
  console.warn("REDIS_DISABLED_NO_URL");
}

const app = express();
app.set("trust proxy", 1);
app.locals.redis = redis;

/* ================= CORS ================= */

const allowedOrigins = [
  "https://totem-platform.odoo.com",
  "https://www.totemv.com",
  "https://totemv.com",
  "https://app.totemv.com",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

/* ================= OBSERVABILITY ================= */

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  req.request_id = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

/* ================= ROOT ================= */

app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) =>
  res.status(200).json({
    ok: true,
    redis: redis ? redis.status : "disabled",
  })
);

/* ================= RATE LIMIT ================= */

function intEnv(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

const RL_WINDOW_MS = intEnv("RATE_LIMIT_WINDOW_MS", 60000);

const rlAvailability = rateLimit({
  windowMs: RL_WINDOW_MS,
  max: intEnv("RATE_LIMIT_AVAILABILITY_MAX", 60),
  keyPrefix: "availability",
  keyFn: (req) =>
    `availability:${req.ip}:${req.params?.slug ?? "na"}:${req.params?.master_id ?? "na"}`,
  redis,
});

const rlBookingCreate = rateLimit({
  windowMs: RL_WINDOW_MS,
  max: intEnv("RATE_LIMIT_BOOKING_CREATE_MAX", 20),
  keyPrefix: "booking_create",
  keyFn: (req) => `booking_create:${req.ip}:${req.params?.slug ?? "na"}`,
  redis,
});

const rlInternal = rateLimit({
  windowMs: RL_WINDOW_MS,
  max: intEnv("RATE_LIMIT_INTERNAL_MAX", 120),
  keyPrefix: "internal",
  keyFn: (req) => `internal:${req.ip}`,
  redis,
});

/* ================= ROUTERS ================= */

app.use(
  "/public",
  createPublicRouter({
    resolveTenant,
    rlAvailability,
    rlBookingCreate,
  })
);

app.use(
  "/internal",
  resolveAuth,
  createInternalRouter({
    rlInternal,
  })
);

/* ================= AUTO FINANCE LOOP ================= */

const INTERNAL_API_TOKEN =
  process.env.INTERNAL_API_TOKEN ||
  "9f3c7a8e2b6d4c1f9a8e7d6c5b4a3928172635445566778899aabbccddeeff00";

async function runFinanceLoop() {
  try {
    const res = await fetch(
      "https://totem-p0-api-production.up.railway.app/internal/finance/run/full",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${INTERNAL_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const txt = await res.text();
    console.log("FINANCE_LOOP_EXECUTED", txt);
  } catch (err) {
    console.error("FINANCE_LOOP_FAILED", err);
  }
}

/* run every 5 minutes */
setInterval(runFinanceLoop, 300000);

/* first run after startup delay */
setTimeout(runFinanceLoop, 15000);

/* ================= START ================= */

const PORT = process.env.PORT || 8080;

initializeSlugReservationLayer(pool).then(() => {
  console.log("SLUG_RESERVATION_READY");
}).catch((error) => {
  console.error("SLUG_RESERVATION_INIT_FAILED", error);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port:", PORT);
});
