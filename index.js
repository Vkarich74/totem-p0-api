// index.js — CORE + LIFECYCLE v2 + AUDIT + EXPORT

import express from "express";
import bodyParser from "body-parser";

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
import { publicRateLimit } from "./middlewares/rateLimitPublic.js";

const app = express();
const PORT = process.env.PORT || 8080;

// Railway proxy fix
app.set("trust proxy", 1);

app.use(bodyParser.json());

// health
app.use("/health", healthRouter);

// public
app.use("/public", publicRateLimit);
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
