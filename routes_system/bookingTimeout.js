// routes_system/bookingTimeout.js — SYSTEM TIMEOUT (Lifecycle v2)

import express from "express";
import { pool } from "../db/index.js";
import updateBookingStatus from "../helpers/updateBookingStatus.js";
import { BOOKING_STATUSES } from "../core/bookingStatus.js";

const router = express.Router();

/**
 * POST /system/bookings/timeout
 * Body (optional):
 * { "minutes": 15 }
 */
router.post("/timeout", async (req, res) => {
  const minutes = Number(req.body?.minutes) || 15;

  const client = await pool.connect();
  let expiredCount = 0;

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `
      SELECT id
      FROM bookings
      WHERE status = $1
        AND created_at < now() - ($2 || ' minutes')::interval
      FOR UPDATE
      `,
      [BOOKING_STATUSES.CREATED, minutes]
    );

    for (const row of rows) {
      await updateBookingStatus(
        client,
        row.id,
        BOOKING_STATUSES.EXPIRED,
        { type: "system" }
      );
      expiredCount++;
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      expired: expiredCount,
      minutes,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({
      ok: false,
      error: err.code || "INTERNAL_ERROR",
    });
  } finally {
    client.release();
  }
});

export default router;
