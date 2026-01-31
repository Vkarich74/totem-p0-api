import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import healthRoute from "./routes_system/health.js";
import availabilityRoute from "./routes_public/availability.js";
import bookingCreateRoute from "./routes_public/bookingCreate.js";
import bookingCancelRoute from "./routes_public/bookingCancel.js";
import bookingResultRoute from "./routes_public/bookingResult.js";
import mastersRoute from "./routes_public/masters.js";
import salonsRoute from "./routes_public/salons.js";
import servicesRoute from "./routes_public/services.js";
import paymentsIntentRoute from "./routes_public/paymentsIntent.js";
import sdkRoute from "./routes_public/sdk.js";
import bookRoute from "./routes_public/book.js";

import authRoute from "./routes_public/auth.js";
import apiGuard from "./middleware/api_guard.js";

import ownerDashboardRoute from "./routes/owner_dashboard.js";
import ownerActionsRoute from "./routes/owner_actions.js";
import ownerAuditRoute from "./routes/owner_audit.js";
import meRoute from "./routes/me.js";

const app = express();
app.use(cors({ credentials:true, origin:true }));
app.use(express.json());
app.use(cookieParser());

app.use(healthRoute);

app.use("/public/availability", availabilityRoute);
app.use("/public/booking/create", bookingCreateRoute);
app.use("/public/booking/cancel", bookingCancelRoute);
app.use("/public/booking/result", bookingResultRoute);
app.use("/public/masters", mastersRoute);
app.use("/public/salons", salonsRoute);
app.use("/public/services", servicesRoute);
app.use("/public/payments/intent", paymentsIntentRoute);
app.use("/public/sdk", sdkRoute);

app.use(bookRoute);

/** 🔒 AUTH — ЖЁСТКО ПОД /auth */
app.use("/auth", authRoute);

app.use("/me", apiGuard, meRoute);
app.use("/owner", apiGuard, ownerDashboardRoute);
app.use("/owner", apiGuard, ownerActionsRoute);
app.use("/owner", apiGuard, ownerAuditRoute);

app.use((req,res)=>res.status(404).json({error:"NOT_FOUND"}));

const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=>console.log("BOOT OK", PORT));
