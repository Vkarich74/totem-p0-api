import express from "express"

import catalog from "../routes_public/catalog.js"
import bookingCreate from "../routes_public/bookingCreate.js"
import bookingStatusRead from "../routes_public/bookingStatusRead.js"

const router = express.Router()

// catalog (read)
router.use("/catalog", catalog)

// bookings (write)
router.use("/bookings", bookingCreate)

// bookings status (read-only)
router.use("/bookings/status", bookingStatusRead)

export default router
