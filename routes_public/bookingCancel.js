// routes_public/bookingCancel.js — lifecycle v2 + AUDIT (PUBLIC)

import express from "express";
import { pool } from "../db/index.js";
import updateBookingStatus from "../helpers/updateBookingStatus.js";

const router = express.Router();

router.post("/:id/cancel", async (req, res) => {
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
      "cancelled",
      { type: "public", id: null },
      `/public/bookings/${bookingId}/cancel`
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      booking_id: bookingId,
      status: "cancelled",
    });
  } catch (err) {
    await client.query("ROLLBACK");

    return res.status(400).json({
      ok: false,
      error: err.code || "BOOKING_NOT_CANCELLABLE",
    });
  } finally {
    client.release();
  }
});

export default router;
