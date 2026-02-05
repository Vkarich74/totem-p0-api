import express from "express"
import bookingCreate from "./bookingCreate.js"
import bookingStatusRead from "./bookingStatusRead.js"

const router = express.Router()

router.use("/bookings", bookingCreate)
router.use("/bookings/status", bookingStatusRead)

export default router
