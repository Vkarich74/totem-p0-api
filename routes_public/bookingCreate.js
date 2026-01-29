// routes_public/bookingCreate.js — REAL DB

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { salon_id, master_slug, service_id, date, start_time, end_time, client } =
    req.body;

  if (!salon_id || !master_slug || !service_id || !date || !start_time || !end_time) {
    return res.status(400).json({ ok: false, error: "INVALID_PAYLOAD" });
  }

  const price = 1000; // v1 fixed
  const status = "pending_payment";

  const { rows } = await pool.query(
    `INSERT INTO bookings (request_id, price, status)
     VALUES (DEFAULT, $1, $2)
     RETURNING booking_id`,
    [price, status]
  );

  const booking_id = rows[0].booking_id;

  return res.json({
    ok: true,
    request_id: booking_id,
    price,
    duration_min: 60,
    status,
  });
});

export default router;
