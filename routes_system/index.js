import express from "express";
import paymentWebhook from "./paymentWebhook.js";

const router = express.Router();

// итоговый URL: /system/payment/webhook
router.use("/payment/webhook", paymentWebhook);

export default router;
