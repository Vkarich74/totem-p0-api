// index.js — FINAL PUBLIC FREEZE
import express from "express";
import bodyParser from "body-parser";

// health
import { healthRouter } from "./routes/health.js";

// public routes
import bookingCreateRouter from "./routes_public/bookingCreate.js";
import paymentsIntentRouter from "./routes_public/paymentsIntent.js";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());

// ===== HEALTH =====
app.use("/health", healthRouter);

// ===== PUBLIC API =====
app.use("/public/bookings", bookingCreateRouter);
app.use("/public/payments/intent", paymentsIntentRouter);

// ===== FALLBACK (JSON ONLY) =====
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "NOT_FOUND" });
});

app.listen(PORT, () => {
  console.log(`TOTEM API listening on port ${PORT}`);
});
