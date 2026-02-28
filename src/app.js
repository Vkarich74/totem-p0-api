import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";

import { resolveTenant } from "./middleware/resolveTenant.js";
import { redisRateLimit } from "./middleware/redisRateLimit.js";
import { availabilityCache } from "./middleware/availabilityCache.js";

import { pool } from "./db.js";
import { publicCreateBooking } from "./routes/publicCreateBooking.js";
import { publicMasterAvailability } from "./routes/publicAvailability.js";
import { expireReservedBookings } from "./jobs/expireReserved.js";

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

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

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

/* ================= REDIS RATE LIMIT ================= */

const publicRateLimit = redisRateLimit({
  windowSeconds: 120,   // 2 minutes
  maxRequests: 100,
  keyPrefix: "public"
});

const bookingRateLimit = redisRateLimit({
  windowSeconds: 120,   // 2 minutes
  maxRequests: 20,
  keyPrefix: "booking"
});

/* ================= ROUTES ================= */

app.post(
  "/public/salons/:slug/bookings",
  bookingRateLimit,
  resolveTenant,
  publicCreateBooking
);

app.get(
  "/public/salons/:slug/masters/:master_id/availability",
  publicRateLimit,
  availabilityCache(30),
  resolveTenant,
  publicMasterAvailability
);

/* ================= TTL ================= */

if (process.env.ENABLE_TTL === "true") {
  setInterval(() => {
    expireReservedBookings();
  }, 60000);
}

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port:", PORT);
});