import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const app = express();

/**
 * BASE
 */
app.use(bodyParser.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const id = crypto.randomUUID();
  req.request_id = id;
  res.setHeader("X-Request-Id", id);
  next();
});

/**
 * HEALTH
 */
app.get("/health", (req, res) => res.json({ ok: true }));

/**
 * =========================
 * PUBLIC API
 * =========================
 */
import publicBooking from "./routes/public_booking.js";
import publicPayment from "./routes/public_payment.js";

app.use("/", publicBooking);
app.use("/", publicPayment);

/**
 * =========================
 * SYSTEM API
 * =========================
 */
import systemPaymentConfirm from "./routes_marketplace/system_payment_confirm.js";
import systemSettlement from "./routes_marketplace/system_settlement.js";
import systemReports from "./routes_marketplace/system_reports.js";

app.use("/system", systemPaymentConfirm);
app.use("/system", systemSettlement);
app.use("/system", systemReports);

/**
 * =========================
 * MARKETPLACE — SIDE EFFECT
 * =========================
 */
require("./routes_marketplace/marketplace_booking_create.js");
require("./routes_marketplace/bookingStatus.js");
require("./routes_marketplace/payments.js");
require("./routes_marketplace/payouts.js");
require("./routes_marketplace/settlement.js");
require("./routes_marketplace/audit.js");
require("./routes_marketplace/reports.js");
require("./routes_marketplace/refunds.js");
require("./routes_marketplace/maintenance.js");
require("./routes_marketplace/metricsTenants.js");
require("./routes_marketplace/publicTokens.js");
require("./routes_marketplace/publicRequests.js");
require("./routes_marketplace/publicRequestProcess.js");
require("./routes_marketplace/publicPaymentsWebhook.js");

/**
 * =========================
 * SCHEDULER (AUTO SETTLEMENT)
 * =========================
 * ⚠️ В PROD по умолчанию ОТКЛЮЧЕН
 * Включается только если:
 *   SCHEDULER_ENABLED=1
 */
if (process.env.SCHEDULER_ENABLED === "1") {
  try {
    require("./routes_marketplace/autoSettlement.js");
    console.log("Scheduler enabled");
  } catch (err) {
    console.error("Scheduler failed to start", err);
  }
} else {
  console.log("Scheduler disabled");
}

/**
 * 404
 */
app.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});

/**
 * START
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TOTEM API listening on ${PORT}`);
});
