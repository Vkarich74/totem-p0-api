import express from "express";
import paymentWebhook from "./paymentWebhook.js";

const router = express.Router();

// Финальный URL: /system/payment/webhook
router.use("/payment/webhook", paymentWebhook);

export default router;
