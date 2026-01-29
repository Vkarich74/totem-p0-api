// routes_system/bookingComplete.js — lifecycle v2 + AUDIT

import express from "express";
import { pool } from "../db/index.js";
import updateBookingStatus from "../helpers/updateBookingStatus.js";

const router = express.Router();

router.post("/:id/complete", async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!bookingId) {
    return res.status(400).json({ ok: false, error: "INVALID_BOOKING_ID" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await updateBookingStatus(
      client,
      bookingId,
      "completed",
      { type: "system", id: "complete" },
      `/system/bookings/${bookingId}/complete`
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      booking_id: bookingId,
      status: "completed",
    });
  } catch (err) {
    await client.query("ROLLBACK");

    return res.status(400).json({
      ok: false,
      error: err.code || "INTERNAL_ERROR",
    });
  } finally {
    client.release();
  }
});

export default router;
