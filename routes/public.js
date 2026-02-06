// routes/public.js
import express from "express";

import catalogRead from "../routes_public/catalog.js";
import bookingCreate from "../routes_public/bookingCreate.js";
import bookingStatusRead from "../routes_public/bookingStatusRead.js";
import paymentsRead from "../routes_public/paymentsRead.js";

const router = express.Router();

/**
 * =========================
 * PUBLIC READ / WRITE ROUTES
 * =========================
 *
 * READ:
 *  - GET /public/catalog
 *  - GET /public/bookings/status
 *  - GET /public/payments
 *
 * WRITE:
 *  - POST /public/bookings
 */

// ===== READ =====

// GET /public/catalog
router.use("/catalog", catalogRead);

// GET /public/bookings/status
router.use("/bookings/status", bookingStatusRead);

// GET /public/payments?booking_id=ID
router.use("/payments", paymentsRead);

// ===== WRITE =====

// POST /public/bookings
router.use("/bookings", bookingCreate);

export default router;
