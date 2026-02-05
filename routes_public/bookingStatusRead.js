import express from "express"
import db from "../db.js"

const router = express.Router()

/*
GET /public/bookings/status
Query:
 - request_id OR booking_id
*/

router.get("/", async (req, res) => {
  try {
    const { request_id, booking_id } = req.query

    if (!request_id && !booking_id) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_INPUT",
        message: "request_id or booking_id is required"
      })
    }

    let booking = null

    if (request_id) {
      booking = await db.get(
        `
        SELECT
          id AS booking_id,
          request_id,
          status,
          created_at,
          updated_at
        FROM bookings
        WHERE request_id = ?
        LIMIT 1
        `,
        [request_id]
      )
    } else {
      booking = await db.get(
        `
        SELECT
          id AS booking_id,
          request_id,
          status,
          created_at,
          updated_at
        FROM bookings
        WHERE id = ?
        LIMIT 1
        `,
        [booking_id]
      )
    }

    if (!booking) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND"
      })
    }

    return res.json({
      ok: true,
      booking
    })

  } catch (err) {
    console.error("[BOOKING_STATUS_READ_ERROR]", err)
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR"
    })
  }
})

export default router
