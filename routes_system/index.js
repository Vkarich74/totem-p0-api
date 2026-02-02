// routes_system/index.js
import express from "express";

import bookingTimeout from "./bookingTimeout.js";
import paymentsWebhook from "./paymentsWebhook.js";
import bookingComplete from "./bookingComplete.js";

const router = express.Router();

// system jobs
router.use("/", bookingTimeout);

// payments
router.use("/payments", paymentsWebhook);

// booking lifecycle
router.use("/bookings", bookingComplete);

export default router;
