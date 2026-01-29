// routes_system/bookingTimeout.js — lifecycle v2 + AUDIT (BATCH)

import express from "express";
import { pool } from "../db/index.js";
import updateBookingStatus from "../helpers/updateBookingStatus.js";

const router = express.Router();

router.post("/timeout", async (req, res) => {
  const minutes = Number(req.body?.minutes || 15);

  const client = await pool.connect();
  let expired = 0;

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `
      SELECT id
      FROM bookings
      WHERE status = 'created'
        AND created_at < now() - interval '${minutes} minutes'
      FOR UPDATE
      `
    );

    for (const row of rows) {
      await updateBookingStatus(
        client,
        row.id,
        "expired",
        { type: "system", id: "timeout" },
        "/system/bookings/timeout"
      );
      expired++;
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      expired,
      minutes,
    });
  } catch (err) {
    await client.query("ROLLBACK");

    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  } finally {
    client.release();
  }
});

export default router;
