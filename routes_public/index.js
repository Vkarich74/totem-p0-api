import express from "express"

import bookingCreate from "./bookingCreate.js"
import bookingStatusRead from "./bookingStatusRead.js"

const router = express.Router()

// POST /public/bookings
router.use("/bookings", bookingCreate)

// GET /public/bookings/status
router.use("/bookings/status", bookingStatusRead)

export default router
