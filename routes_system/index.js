// routes_system/index.js
import express from "express";

import bookingTimeout from "./bookingTimeout.js";
import paymentsWebhook from "./paymentsWebhook.js";

const router = express.Router();

// system jobs
router.use("/", bookingTimeout);

// payments webhook
router.use("/payments", paymentsWebhook);

export default router;
