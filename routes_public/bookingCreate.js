// routes_public/bookingCreate.js — TOKEN-AWARE

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
    client
  } = req.body;

  // ENFORCE token → salon binding
  if (req.publicToken && req.publicToken.salon_id !== salon_id) {
    return res.status(403).json({
      ok: false,
      error: "SALON_TOKEN_MISMATCH"
    });
  }

  if (
    !salon_id ||
    !master_slug ||
    !service_id ||
    !date ||
    !start_time ||
    !end_time
  ) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_PAYLOAD"
    });
  }

  try {
    // dedupe slot
    const existing = await pool.query(
      `
      SELECT id FROM bookings
      WHERE salon_id = $1
        AND master_slug = $2
        AND service_id = $3
        AND date = $4
        AND start_time = $5
        AND end_time = $6
        AND status NOT IN ('cancelled','expired')
      `,
      [salon_id, master_slug, service_id, date, start_time, end_time]
    );

    if (existing.rows.length) {
      return res.json({
        ok: false,
        error: "BOOKING_ALREADY_EXISTS"
      });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO bookings
        (salon_id, master_slug, service_id, date, start_time, end_time, client, status)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,'created')
      RETURNING id
      `,
      [
        salon_id,
        master_slug,
        service_id,
        date,
        start_time,
        end_time,
        client || {}
      ]
    );

    return res.json({
      ok: true,
      request_id: rows[0].id,
      status: "pending_payment"
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "BOOKING_CREATE_FAILED"
    });
  }
});

export default router;
