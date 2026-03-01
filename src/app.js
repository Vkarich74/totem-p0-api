import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";

import { resolveTenant } from "./middleware/resolveTenant.js";
import { rateLimit } from "./middleware/rateLimit.js";

import { publicCreateBooking } from "./routes/publicCreateBooking.js";
import { publicMasterAvailability } from "./routes/publicAvailability.js";
import { confirmBooking } from "./routes/confirmBooking.js";
import { completeBooking } from "./routes/completeBooking.js";

const app = express();
app.set("trust proxy", 1);

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
app.get("/health", (req, res) => res.status(200).json({ ok: true }));

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
});

const rlBookingCreate = rateLimit({
  windowMs: RL_WINDOW_MS,
  max: intEnv("RATE_LIMIT_BOOKING_CREATE_MAX", 20),
  keyPrefix: "booking_create",
  keyFn: (req) => `booking_create:${req.ip}:${req.params?.slug ?? "na"}`,
});

const rlInternal = rateLimit({
  windowMs: RL_WINDOW_MS,
  max: intEnv("RATE_LIMIT_INTERNAL_MAX", 120),
  keyPrefix: "internal",
  keyFn: (req) => `internal:${req.ip}`,
});

/* ================= PUBLIC ROUTES ================= */

app.post(
  "/public/salons/:slug/bookings",
  rlBookingCreate,
  resolveTenant,
  publicCreateBooking
);

app.get(
  "/public/salons/:slug/masters/:master_id/availability",
  rlAvailability,
  resolveTenant,
  publicMasterAvailability
);

/* ================= INTERNAL ROUTES (POSTPAID) ================= */

app.post("/internal/bookings/:id/confirm", rlInternal, confirmBooking);
app.post("/internal/bookings/:id/complete", rlInternal, completeBooking);

/* ================= PREPAID (FROZEN) =================
   PaymentIntent endpoints intentionally NOT registered in POSTPAID model.
   Code remains in src/routes/paymentIntents.js but is unreachable from HTTP.
*/

/* ================= TTL (REMOVED) =================
   TTL engine intentionally removed in POSTPAID model.
   ENABLE_TTL env may still exist but has no effect now.
*/

/* ================= START ================= */

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port:", PORT);
});