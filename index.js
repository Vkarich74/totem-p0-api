// index.js — CORE + SYSTEM + MARKETPLACE (PROD READY)

import express from "express";
import bodyParser from "body-parser";

// ===== HEALTH =====
import { healthRouter } from "./routes/health.js";

// ===== PUBLIC ROUTES =====
import bookingCreateRouter from "./routes_public/bookingCreate.js";
import paymentsIntentRouter from "./routes_public/paymentsIntent.js";

// ===== SYSTEM / MARKETPLACE ROUTES =====
import paymentsWebhookRouter from "./routes_system/paymentsWebhook.js";
import payoutsCreateRouter from "./routes_marketplace/payoutsCreate.js";
import payoutsSettleRouter from "./routes_system/payoutsSettle.js";
import opsExportRouter from "./routes_system/opsExport.js";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());

// ===== HEALTH =====
app.use("/health", healthRouter);

// ===== PUBLIC API =====
app.use("/public/bookings", bookingCreateRouter);
app.use("/public/payments/intent", paymentsIntentRouter);

// ===== SYSTEM / MARKETPLACE API =====
app.use("/payments/webhook", paymentsWebhookRouter);
app.use("/marketplace/payouts", payoutsCreateRouter);
app.use("/system/payouts", payoutsSettleRouter);
app.use("/system/ops", opsExportRouter);

// ===== FALLBACK =====
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "NOT_FOUND" });
});

app.listen(PORT, () => {
  console.log(`TOTEM API listening on port ${PORT}`);
});
