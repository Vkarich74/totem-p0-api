import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

// system
import healthRoute from "./routes_system/health.js";

// public api
import availabilityRoute from "./routes_public/availability.js";
import bookingCreateRoute from "./routes_public/bookingCreate.js";
import bookingCancelRoute from "./routes_public/bookingCancel.js";
import bookingResultRoute from "./routes_public/bookingResult.js";
import mastersRoute from "./routes_public/masters.js";
import salonsRoute from "./routes_public/salons.js";
import servicesRoute from "./routes_public/services.js";
import paymentsIntentRoute from "./routes_public/paymentsIntent.js";
import sdkRoute from "./routes_public/sdk.js";

// public ui
import bookRoute from "./routes_public/book.js";
import authRoute from "./routes_public/auth.js";

// guard
import apiGuard from "./middleware/api_guard.js";

// owner / protected
import ownerDashboardRoute from "./routes/owner_dashboard.js";
import ownerActionsRoute from "./routes/owner_actions.js";
import ownerAuditRoute from "./routes/owner_audit.js";

// me
import meRoute from "./routes/me.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// system
app.use(healthRoute);

// public API
app.use("/public/availability", availabilityRoute);
app.use("/public/booking/create", bookingCreateRoute);
app.use("/public/booking/cancel", bookingCancelRoute);
app.use("/public/booking/result", bookingResultRoute);
app.use("/public/masters", mastersRoute);
app.use("/public/salons", salonsRoute);
app.use("/public/services", servicesRoute);
app.use("/public/payments/intent", paymentsIntentRoute);
app.use("/public/sdk", sdkRoute);

// public UI
app.use(bookRoute);
app.use(authRoute);

// 🔒 ME (protected)
app.use("/me", apiGuard, meRoute);

// 🔒 PROTECTED OWNER AREA
app.use("/owner", apiGuard, ownerDashboardRoute);
app.use("/owner", apiGuard, ownerActionsRoute);
app.use("/owner", apiGuard, ownerAuditRoute);

// fallback
app.use((req, res) => {
  res.status(404).json({ error: "NOT_FOUND" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("BOOT OK on port", PORT);
});
