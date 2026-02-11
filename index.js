import express from "express";
import db from "./db.js";
import cookieParser from "cookie-parser";

import ownerRoutes from "./routes_owner/index.js";
import calendarRoutes from "./calendar/calendar.routes.js";
import bookingRoutes from "./booking/booking.routes.js";
import reportsRoutes from "./reports/index.js";
import systemRoutes from "./routes/system.js";
import systemOnboardingRoutes from "./routes/system_onboarding.js";

import authRoutes from "./auth/auth.routes.js";
import { ensureAuthTables } from "./auth/auth.sql.js";

import { ensureCalendarTable } from "./calendar/calendar.sql.js";
import { ensureBookingsTable } from "./booking/booking.sql.js";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(cookieParser());

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/**
 * AUTH (keeps canonical paths)
 * - POST /auth/login
 * - POST /auth/logout
 * - GET  /auth/resolve
 */
app.use(authRoutes);

app.use("/system/onboarding", systemOnboardingRoutes);
app.use("/system", systemRoutes);
app.use("/owner", ownerRoutes);
app.use("/calendar", calendarRoutes);
app.use("/booking", bookingRoutes);
app.use("/reports", reportsRoutes);

app.use((req, res) => res.status(404).json({ error: "NOT_FOUND" }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "INTERNAL_ERROR" });
});

async function bootstrap() {
  await ensureCalendarTable();
  await ensureBookingsTable();
  await ensureAuthTables();

  app.listen(PORT, () => {
    console.log("TOTEM API STARTED", PORT);
  });
}

bootstrap().catch((e) => {
  console.error("[BOOTSTRAP_FAILED]", e);
  process.exit(1);
});
