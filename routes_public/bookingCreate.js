// routes_public/bookingCreate.js — PROD + ABUSE GUARD v1

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const {
    salon_id,
    master_slug,
    service_id,
    date,
    start_time,
    end_time,
    client,
  } = req.body;

  if (!salon_id || !master_slug || !service_id || !date || !start_time) {
    return res.status(400).json({ ok: false, error: "INVALID_PAYLOAD" });
  }

  // 1️⃣ ABUSE GUARD: duplicate booking check
  const existing = await pool.query(
    `
    SELECT id
    FROM bookings
    WHERE salon_slug = $1
      AND master_slug = $2
      AND date = $3
      AND start_time = $4
      AND status IN ('created', 'pending_payment')
    LIMIT 1
    `,
    [salon_id, master_slug, date, start_time]
  );

  if (existing.rows.length) {
    return res.status(409).json({
      ok: false,
      error: "BOOKING_ALREADY_EXISTS",
    });
  }

  // v1 fixed price
  const price = 1000;
  const duration_min = 60;

  const { rows } = await pool.query(
    `
    INSERT INTO bookings
      (salon_slug, master_slug, service_id, date, start_time, status)
    VALUES
      ($1, $2, $3, $4, $5, 'created')
    RETURNING id
    `,
    [salon_id, master_slug, service_id, date, start_time]
  );

  const booking_id = rows[0].id;

  return res.json({
    ok: true,
    request_id: booking_id,
    price,
    duration_min,
    status: "pending_payment",
  });
});

export default router;
