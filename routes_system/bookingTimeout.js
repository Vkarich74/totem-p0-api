// routes_system/bookingTimeout.js
// System job: expire unpaid bookings by TTL

import express from "express";
import { pool } from "../db/index.js";
import updateBookingStatus from "../helpers/updateBookingStatus.js";

const router = express.Router();

// POST /system/bookings/timeout
// Body: { ttl_minutes?: number }
router.post("/bookings/timeout", async (req, res) => {
  const ttlMinutes = Number(req.body?.ttl_minutes || 15);
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    return res.status(400).json({ ok: false, error: "INVALID_TTL" });
  }

  const client = await pool.connect();
  let expired = 0;

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `
      SELECT id
      FROM bookings
      WHERE status = 'pending_payment'
        AND created_at < NOW() - ($1 || ' minutes')::interval
      FOR UPDATE
      `,
      [ttlMinutes]
    );

    for (const row of rows) {
      await updateBookingStatus(
        client,
        row.id,
        "expired",
        { type: "system", id: null },
        "/system/bookings/timeout"
      );
      expired++;
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      ttl_minutes: ttlMinutes,
      expired_bookings: expired,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("bookingTimeout error:", err);
    return res.status(500).json({ ok: false, error: "TIMEOUT_FAILED" });
  } finally {
    client.release();
  }
});

export default router;
