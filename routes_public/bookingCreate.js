// routes_public/bookingCreate.js — FINAL TOKEN-SAFE
// Self-defensive: does not trust middleware blindly

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const {
    salon_slug,
    master_slug,
    service_id,
    date,
    start_time
  } = req.body;

  const tokenHeader = req.header("X-Public-Token");

  // ⛔ token header present, but middleware did NOT attach context
  if (tokenHeader && !req.publicToken) {
    return res.status(401).json({
      ok: false,
      error: "INVALID_PUBLIC_TOKEN"
    });
  }

  // ⛔ token → salon binding
  if (req.publicToken && req.publicToken.salon_id !== salon_slug) {
    return res.status(403).json({
      ok: false,
      error: "SALON_TOKEN_MISMATCH"
    });
  }

  if (
    !salon_slug ||
    !master_slug ||
    !service_id ||
    !date ||
    !start_time
  ) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_PAYLOAD"
    });
  }

  try {
    const existing = await pool.query(
      `
      SELECT id FROM bookings
      WHERE salon_slug = $1
        AND master_slug = $2
        AND service_id = $3
        AND date = $4
        AND start_time = $5
        AND status NOT IN ('cancelled','expired')
      `,
      [salon_slug, master_slug, service_id, date, start_time]
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
        (salon_slug, master_slug, service_id, date, start_time)
      VALUES
        ($1,$2,$3,$4,$5)
      RETURNING id
      `,
      [salon_slug, master_slug, service_id, date, start_time]
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
