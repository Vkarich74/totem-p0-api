// routes_public/bookingCreate.js
// Create booking (PUBLIC)
// Token validation & salon binding handled by publicToken middleware

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const {
      salon_slug,
      master_slug,
      service_id,
      date,
      start_time,
    } = req.body || {};

    if (!salon_slug || !master_slug || !service_id || !date || !start_time) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_PAYLOAD",
      });
    }

    // ❗ IMPORTANT:
    // Salon access is already validated by publicToken middleware.
    // Do NOT re-check salon here.

    const { rows } = await pool.query(
      `
      INSERT INTO bookings (
        salon_slug,
        master_slug,
        service_id,
        date,
        start_time,
        status,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, 'pending_payment', NOW())
      RETURNING id
      `,
      [salon_slug, master_slug, service_id, date, start_time]
    );

    return res.json({
      ok: true,
      request_id: rows[0].id,
      status: "pending_payment",
    });
  } catch (err) {
    console.error("bookingCreate error:", err);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

export default router;
