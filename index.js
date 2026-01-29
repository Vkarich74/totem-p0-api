// index.js — CORE + SYSTEM + MARKETPLACE (SECURED)

import express from "express";
import bodyParser from "body-parser";

// health
import { healthRouter } from "./routes/health.js";

// public
import bookingCreateRouter from "./routes_public/bookingCreate.js";
import paymentsIntentRouter from "./routes_public/paymentsIntent.js";

// system / marketplace
import paymentsWebhookRouter from "./routes_system/paymentsWebhook.js";
import payoutsCreateRouter from "./routes_marketplace/payoutsCreate.js";
import opsExportRouter from "./routes_system/opsExport.js";

import { systemAuth } from "./middlewares/systemAuth.js";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());

// health
app.use("/health", healthRouter);

// public
app.use("/public/bookings", bookingCreateRouter);
app.use("/public/payments/intent", paymentsIntentRouter);

// system (protected)
app.use("/payments/webhook", systemAuth, paymentsWebhookRouter);
app.use("/system/ops", systemAuth, opsExportRouter);

// marketplace (internal)
app.use("/marketplace/payouts", systemAuth, payoutsCreateRouter);

// fallback
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "NOT_FOUND" });
});

app.listen(PORT, () => {
  console.log(`TOTEM API listening on port ${PORT}`);
});
