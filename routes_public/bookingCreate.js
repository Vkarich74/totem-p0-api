// routes_public/bookingCreate.js — REAL PROD SCHEMA

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

  const price = 1000; // v1 fixed
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
    request_id: booking_id, // API contract
    price,
    duration_min,
    status: "pending_payment",
  });
});

export default router;
