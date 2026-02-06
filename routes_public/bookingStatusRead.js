import express from "express"
import db from "../db.js"

const router = express.Router()

router.get("/", async (req, res) => {
  try {
    const { request_id, booking_id } = req.query

    if (!request_id && !booking_id) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_INPUT"
      })
    }

    let booking

    if (request_id) {
      booking = await db.get(
        `SELECT id AS booking_id, request_id, status, created_at, updated_at
         FROM bookings WHERE request_id = ? LIMIT 1`,
        [request_id]
      )
    } else {
      booking = await db.get(
        `SELECT id AS booking_id, request_id, status, created_at, updated_at
         FROM bookings WHERE id = ? LIMIT 1`,
        [booking_id]
      )
    }

    if (!booking) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" })
    }

    res.json({ ok: true, booking })
  } catch (e) {
    console.error("[BOOKING_STATUS_READ]", e)
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR" })
  }
})

export default router
