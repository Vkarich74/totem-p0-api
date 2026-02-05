import express from "express";
import paymentWebhook from "./paymentWebhook.js";

const router = express.Router();

router.use("/", paymentWebhook);

export default router;
