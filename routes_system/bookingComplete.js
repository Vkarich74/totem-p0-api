// routes_system/bookingComplete.js — lifecycle v2 + AUDIT (SECURED)
// Endpoint: POST /system/bookings/:id/complete
// Auth: X-System-Token

import express from "express";
import { pool } from "../db/index.js";
import updateBookingStatus from "../helpers/updateBookingStatus.js";

const router = express.Router();

// 🔐 system auth
function requireSystemToken(req, res, next) {
  const token =
    req.headers["x-system-token"] ||
    req.headers["X-System-Token"];

  if (!process.env.SYSTEM_TOKEN) {
    return res.status(500).json({
      ok: false,
      error: "SYSTEM_TOKEN_NOT_CONFIGURED",
    });
  }

  if (token !== process.env.SYSTEM_TOKEN) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  next();
}

router.post("/:id/complete", requireSystemToken, async (req, res) => {
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

    return res.status(409).json({
      ok: false,
      error: err.code || "INVALID_STATUS_TRANSITION",
    });
  } finally {
    client.release();
  }
});

export default router;
