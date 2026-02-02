import express from "express";
import bookingTimeout from "./bookingTimeout.js";

const router = express.Router();

router.use("/", bookingTimeout);

export default router;
