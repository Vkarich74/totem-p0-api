// routes_system/exportBookings.js — BOOKINGS + AUDIT EXPORT (READ-ONLY)

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

/**
 * POST /system/export/bookings
 * Body:
 * {
 *   "from": "2026-01-01",
 *   "to": "2026-01-31"
 * }
 */
router.post("/bookings", async (req, res) => {
  const { from, to } = req.body || {};

  if (!from || !to) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_DATE_RANGE",
    });
  }

  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `
      SELECT
        b.id               AS booking_id,
        b.salon_slug,
        b.master_slug,
        b.service_id,
        b.date,
        b.start_time,
        b.status           AS booking_status,
        b.created_at       AS booking_created_at,

        a.from_status,
        a.to_status,
        a.actor_type,
        a.actor_id,
        a.source,
        a.created_at       AS audit_created_at

      FROM bookings b
      LEFT JOIN booking_audit_log a
        ON a.booking_id = b.id

      WHERE b.created_at BETWEEN $1 AND $2
      ORDER BY b.id, a.created_at
      `,
      [from, to]
    );

    return res.json({
      ok: true,
      from,
      to,
      rows,
      count: rows.length,
    });
  } catch (err) {
    console.error("EXPORT ERROR:", err);

    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  } finally {
    client.release();
  }
});

export default router;
