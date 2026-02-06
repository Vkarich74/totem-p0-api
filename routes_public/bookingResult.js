// routes_public/bookingResult.js
// Public Booking Result — CANONICAL v1
// GET /public/bookings/:id/result
// Source of truth: bookings.status

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

router.get("/:id/result", async (req, res) => {
  const bookingId = Number(req.params.id);

  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const client = await pool.connect();
  try {
    const { rows, rowCount } = await client.query(
      `
      SELECT id, status
      FROM bookings
      WHERE id = $1
      `,
      [bookingId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const status =
      rows[0].status === "created"
        ? "pending_payment"
        : rows[0].status;

    return res.status(200).json({
      booking_id: rows[0].id,
      status,
    });
  } catch (err) {
    console.error("bookingResult error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  } finally {
    client.release();
  }
});

export default router;
