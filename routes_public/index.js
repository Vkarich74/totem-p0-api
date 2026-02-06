// routes_public/index.js
import express from "express";

// AUTH / META
import auth from "./auth.js";

// READ
import availability from "./availability.js";
import masters from "./masters.js";
import services from "./services.js";
import salons from "./salons.js";

// BOOKINGS
import bookingCreate from "./bookingCreate.js";
import bookingStatusRead from "./bookingStatusRead.js";
import bookingCancel from "./bookingCancel.js";
import bookingResult from "./bookingResult.js";
import bookings from "./bookings.js";

// PAYMENTS
import paymentsIntent from "./paymentsIntent.js";
import paymentsRead from "./paymentsRead.js";

// OTHER
import sdk from "./sdk.js";
import widget from "./widget.js";

const router = express.Router();

/**
 * =========================
 * PUBLIC API — CANONICAL
 * =========================
 */

// AUTH
router.use("/auth", auth);

// READ
router.use("/availability", availability);
router.use("/masters", masters);
router.use("/services", services);
router.use("/salons", salons);

// BOOKINGS
router.use("/bookings", bookings);
router.use("/bookings/create", bookingCreate);
router.use("/bookings/status", bookingStatusRead);
router.use("/bookings/cancel", bookingCancel);
router.use("/bookings/result", bookingResult);

// PAYMENTS
router.use("/payments/intent", paymentsIntent);
router.use("/payments", paymentsRead);

// SDK / WIDGET
router.use("/sdk", sdk);
router.use("/widget", widget);

export default router;
