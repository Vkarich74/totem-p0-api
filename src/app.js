import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import Redis from "ioredis";
import {
  assertStagingProcessSafety,
  resolveCorsAllowedOrigins,
  isStagingRuntime,
} from "./staging/stagingSafety.js";

import { pool } from "./db.js";

import { resolveTenant } from "./middleware/resolveTenant.js";
import { resolveAuth } from "./middleware/resolveAuth.js";
import { rateLimit } from "./middleware/rateLimit.js";

import { createPublicRouter } from "./routes/public.js";
import authRouter from "./routes/auth.js";
import { createInternalRouter } from "./routes/internal.js";
import { initializeSlugReservationLayer } from "./services/provision/slugReservation.js";

// Strict staging boot gate: no Production DB, CORS, money or connector secrets.
// Outside NODE_ENV=staging this does nothing; KG/KZ Production is unaffected.
assertStagingProcessSafety(process.env);

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

const allowedOrigins = resolveCorsAllowedOrigins(process.env, [
  "https://totem-platform.odoo.com",
  "https://www.totemv.com",
  "https://totemv.com",
  "https://app.totemv.com",
  "https://totem-admin-production.up.railway.app",
  "http://localhost:5173",
]);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      const error = new Error("Not allowed by CORS");
      error.status = 403;
      return callback(error);
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

// DB write lock while Staging has no approved schema or test records.
// All dynamic routes fail closed. The explicit /health and /version only
// are available above this guard, so no signup, booking, wallet, user CRUD
// or internal schema setup can run in a newly allocated empty Staging DB.
if (isStagingRuntime(process.env) &&
    process.env.TOTEM_STAGE_EMPTY_DB === "1") {
  app.use((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({
      ok: false,
      error: "STAGING_EMPTY_DATABASE_LOCKED",
      allowed_actions: ["health", "version"],
    });
  });
}

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

/* Legacy billing auto-charge is quarantined before the optional internal auth layer. */
app.post("/internal/billing/auto-charge/run", (req, res) => {
  return res.status(410).json({
    ok: false,
    error: "LEGACY_BILLING_AUTO_CHARGE_DISABLED",
  });
});

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

// initializeSlugReservationLayer issues CREATE TABLE IF NOT EXISTS.
// Do not call it while the owner has prohibited populating Staging DB.
if (!(isStagingRuntime(process.env) &&
      process.env.TOTEM_STAGE_EMPTY_DB === "1")) {
  initializeSlugReservationLayer(pool).then(() => {
    console.log("SLUG_RESERVATION_READY");
  }).catch((error) => {
    console.error("SLUG_RESERVATION_INIT_FAILED", error);
  });
} else {
  console.log("STAGING_EMPTY_DATABASE_LOCKED_NO_SCHEMA_WRITES");
}

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port:", PORT);
});
