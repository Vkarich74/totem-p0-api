import express from "express";
import db from "./db.js";

import ownerRoutes from "./routes_owner/index.js";
import calendarRoutes from "./calendar/calendar.routes.js";
import bookingRoutes from "./booking/booking.routes.js";
import reportsRoutes from "./reports/index.js";
import systemRoutes from "./routes/system.js";
import systemOnboardingRoutes from "./routes/system_onboarding.js";
import authRoutes from "./auth/auth.routes.js";
import debugAuthRoutes from "./routes/debug.auth.js";

import { ensureCalendarTable } from "./calendar/calendar.sql.js";
import { ensureBookingsTable } from "./booking/booking.sql.js";
import { ensureAuthTables } from "./auth/auth.sql.js";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/debug", debugAuthRoutes);

app.use("/system/onboarding", systemOnboardingRoutes);
app.use("/system", systemRoutes);
app.use("/owner", ownerRoutes);
app.use("/calendar", calendarRoutes);
app.use("/booking", bookingRoutes);
app.use("/reports", reportsRoutes);
app.use("/auth", authRoutes);

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
