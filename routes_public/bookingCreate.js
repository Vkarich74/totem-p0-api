// routes_public/bookingCreate.js
// Create booking (PUBLIC) — CANONICAL v1
// Idempotent by request_id + audit guaranteed

import express from "express";
import { pool } from "../db/index.js";
import { writeBookingAudit } from "../utils/audit.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      salon_slug,
      master_slug,
      service_id,
      date,
      start_time,
      request_id,
    } = req.body || {};

    if (!salon_slug || !master_slug || !service_id || !date || !start_time) {
      return res.status(400).json({ error: "INVALID_INPUT" });
    }
    if (request_id && typeof request_id !== "string") {
      return res.status(400).json({ error: "INVALID_INPUT" });
    }

    await client.query("BEGIN");

    // Idempotency
    if (request_id) {
      const existing = await client.query(
        `SELECT id, status FROM bookings WHERE request_id = $1 LIMIT 1`,
        [request_id]
      );
      if (existing.rowCount > 0) {
        await client.query("COMMIT");
        return res.status(200).json({
          booking_id: existing.rows[0].id,
          status:
            existing.rows[0].status === "created"
              ? "pending_payment"
              : existing.rows[0].status,
          request_id,
        });
      }
    }

    // Create booking
    const insert = await client.query(
      `
      INSERT INTO bookings (
        salon_slug,
        master_slug,
        service_id,
        date,
        start_time,
        status,
        request_id,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, 'pending_payment', $6, NOW())
      RETURNING id
      `,
      [salon_slug, master_slug, service_id, date, start_time, request_id || null]
    );

    await client.query("COMMIT");

    // Audit (non-blocking)
    writeBookingAudit({
      booking_id: insert.rows[0].id,
      from_status: null,
      to_status: "pending_payment",
      actor_type: "public",
      actor_id: null,
      source: "bookingCreate",
    });

    return res.status(200).json({
      booking_id: insert.rows[0].id,
      status: "pending_payment",
      request_id: request_id || null,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("bookingCreate error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  } finally {
    client.release();
  }
});

export default router;
