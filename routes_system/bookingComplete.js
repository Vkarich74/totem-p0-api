// routes_system/bookingComplete.js — SYSTEM CONFIRM / COMPLETE (Lifecycle v2)

import express from "express";
import { pool } from "../db/index.js";
import updateBookingStatus from "../helpers/updateBookingStatus.js";
import { BOOKING_STATUSES } from "../core/bookingStatus.js";

const router = express.Router();

/**
 * POST /system/bookings/:id/complete
 */
router.post("/:id/complete", async (req, res) => {
  const bookingId = Number(req.params.id);

  if (!bookingId) {
    return res.status(400).json({ ok: false, error: "INVALID_BOOKING_ID" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows, rowCount } = await client.query(
      `
      SELECT id, status
      FROM bookings
      WHERE id = $1
      FOR UPDATE
      `,
      [bookingId]
    );

    if (rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, error: "BOOKING_NOT_FOUND" });
    }

    const booking = rows[0];

    // allow complete only from PAID
    if (booking.status !== BOOKING_STATUSES.PAID) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        ok: false,
        error: "BOOKING_NOT_COMPLETABLE",
      });
    }

    await updateBookingStatus(
      client,
      bookingId,
      BOOKING_STATUSES.COMPLETED,
      { type: "system" }
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      booking_id: bookingId,
      status: BOOKING_STATUSES.COMPLETED,
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
