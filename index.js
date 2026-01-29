// index.js — MINIMAL SAFE BOOT
import express from "express";
import bodyParser from "body-parser";

// health
import { healthRouter } from "./routes/health.js";

// public
import bookingCreateRouter from "./routes_public/bookingCreate.js";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.json());

// --- HEALTH
app.use("/health", healthRouter);

// --- PUBLIC API
app.use("/public/bookings", bookingCreateRouter);

// --- FALLBACK
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "NOT_FOUND" });
});

app.listen(PORT, () => {
  console.log(`TOTEM API listening on port ${PORT}`);
});
