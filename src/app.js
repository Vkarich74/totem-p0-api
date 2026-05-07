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
import authRouter from "./routes/auth.js";
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
  "https://totem-admin-production.up.railway.app",
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

function getRuntimeMetadata() {
  return {
    git_sha: String(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || process.env.COMMIT_SHA || ""),
    git_commit: String(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || process.env.SOURCE_VERSION || ""),
    build_id: String(process.env.RAILWAY_DEPLOYMENT_ID || process.env.BUILD_ID || process.env.RENDER_GIT_COMMIT || ""),
    build_time: String(process.env.BUILD_TIME || process.env.RAILWAY_DEPLOYMENT_CREATED_AT || ""),
    node_env: String(process.env.NODE_ENV || ""),
  };
}

app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) =>
  res.status(200).json({
    ok: true,
    redis: redis ? redis.status : "disabled",
  })
);
app.get("/version", (req, res) =>
  res.status(200).json({
    ok: true,
    service: "totem-p0-api",
    runtime: getRuntimeMetadata(),
  })
);
app.get("/build", (req, res) =>
  res.status(200).json({
    ok: true,
    service: "totem-p0-api",
    runtime: getRuntimeMetadata(),
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

app.use("/auth", authRouter);

app.use(
  "/internal",
  resolveAuth,
  createInternalRouter({
    rlInternal,
  })
);

/* ================= AUTO FINANCE LOOP ================= */

const AUTO_FINANCE_LOOP_ENABLED = String(process.env.AUTO_FINANCE_LOOP_ENABLED || "").toLowerCase() === "true";
const INTERNAL_API_TOKEN = String(process.env.INTERNAL_API_TOKEN || "").trim();

async function runFinanceLoop() {
  if (!AUTO_FINANCE_LOOP_ENABLED) {
    return;
  }

  if (!INTERNAL_API_TOKEN) {
    console.warn("FINANCE_LOOP_SKIPPED_NO_INTERNAL_API_TOKEN");
    return;
  }

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

if (AUTO_FINANCE_LOOP_ENABLED) {
  /* run every 5 minutes */
  setInterval(runFinanceLoop, 300000);

  /* first run after startup delay */
  setTimeout(runFinanceLoop, 15000);
} else {
  console.log("FINANCE_LOOP_DISABLED");
}

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
