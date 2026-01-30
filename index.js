// index.js — HARDENED order (token → rate-limit)

import express from "express";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

// health
import { healthRouter } from "./routes/health.js";

// public
import bookingCreateRouter from "./routes_public/bookingCreate.js";
import bookingCancelRouter from "./routes_public/bookingCancel.js";
import paymentsIntentRouter from "./routes_public/paymentsIntent.js";

// system
import paymentsWebhookRouter from "./routes_system/paymentsWebhook.js";
import bookingTimeoutRouter from "./routes_system/bookingTimeout.js";
import bookingCompleteRouter from "./routes_system/bookingComplete.js";
import exportBookingsRouter from "./routes_system/exportBookings.js";
import opsExportRouter from "./routes_system/opsExport.js";

// marketplace
import payoutsCreateRouter from "./routes_marketplace/payoutsCreate.js";

// middlewares
import { systemAuth } from "./middlewares/systemAuth.js";
import { publicToken } from "./middlewares/publicToken.js";
import { publicRateLimit } from "./middlewares/rateLimitPublic.js";

const app = express();
const PORT = process.env.PORT || 8080;

app.set("trust proxy", 1);
app.use(bodyParser.json());

// static
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/public/static", express.static(path.join(__dirname, "public")));

// health
app.use("/health", healthRouter);

// public: token FIRST, then rate-limit
app.use("/public", publicToken, publicRateLimit);
app.use("/public/bookings", bookingCreateRouter);
app.use("/public/bookings", bookingCancelRouter);
app.use("/public/payments/intent", paymentsIntentRouter);

// system
app.use("/payments/webhook", systemAuth, paymentsWebhookRouter);
app.use("/system/bookings", systemAuth, bookingTimeoutRouter);
app.use("/system/bookings", systemAuth, bookingCompleteRouter);
app.use("/system/export", systemAuth, exportBookingsRouter);
app.use("/system/ops", systemAuth, opsExportRouter);

// marketplace
app.use("/marketplace/payouts", systemAuth, payoutsCreateRouter);

// fallback
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "NOT_FOUND" });
});

app.listen(PORT, () => {
  console.log(`TOTEM API listening on port ${PORT}`);
});
