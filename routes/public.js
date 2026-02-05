import express from "express"

// существующие public routes (НЕ ЛОМАЕМ)
import bookingCreate from "../routes_public/bookingCreate.js"

// новый read-only endpoint
import bookingStatusRead from "../routes_public/bookingStatusRead.js"

const router = express.Router()

/*
  ВАЖНО:
  - catalog уже подключён внутри bookingCreate / или выше по цепочке
  - мы его НЕ трогаем
*/

// write: POST /public/bookings
router.use("/bookings", bookingCreate)

// read-only: GET /public/bookings/status
router.use("/bookings/status", bookingStatusRead)

export default router
