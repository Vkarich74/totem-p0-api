// routes_public/availability.js
// Public read-only availability — CANONICAL v1
// GET /public/availability
// Query: salon_slug, master_slug, service_id, date
// v1 logic: returns free slots by excluding booked times

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

// v1 fixed working hours (can be moved to config later)
const WORK_START = "10:00";
const WORK_END = "18:00";

// helper: add minutes to HH:MM
function addMinutes(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  d.setMinutes(d.getMinutes() + minutes);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// helper: time < other
function timeLt(a, b) {
  return a.localeCompare(b) < 0;
}

router.get("/", async (req, res) => {
  const { salon_slug, master_slug, service_id, date } = req.query || {};

  if (!salon_slug || !master_slug || !service_id || !date) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const client = await pool.connect();
  try {
    // 1) get service duration
    const svc = await client.query(
      `
      SELECT duration_min
      FROM services
      WHERE service_id = $1
      LIMIT 1
      `,
      [service_id]
    );

    if (svc.rowCount === 0) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const duration = svc.rows[0].duration_min;

    // 2) get booked start times for the day (non-cancelled)
    const booked = await client.query(
      `
      SELECT start_time
      FROM bookings
      WHERE date = $1
        AND master_slug = $2
        AND status IN ('pending_payment','paid')
      `,
      [date, master_slug]
    );

    const bookedTimes = new Set(
      booked.rows.map((r) =>
        typeof r.start_time === "string"
          ? r.start_time.slice(0, 5)
          : r.start_time.toISOString().slice(11, 16)
      )
    );

    // 3) build slots
    const slots = [];
    let t = WORK_START;

    while (timeLt(t, WORK_END)) {
      if (!bookedTimes.has(t)) {
        slots.push(t);
      }
      t = addMinutes(t, duration);
    }

    return res.status(200).json({
      date,
      slots,
    });
  } catch (err) {
    console.error("availability error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  } finally {
    client.release();
  }
});

export default router;
