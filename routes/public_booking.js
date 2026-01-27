import express from "express";
import { db } from "../db/index.js";

const router = express.Router();

/**
 * Add minutes to HH:MM
 */
function addMinutes(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m + minutes, 0);
  return d.toTimeString().slice(0, 5);
}

/**
 * PUBLIC — CREATE BOOKING
 * SCHEMA-COMPATIBLE:
 * requires salon_id, master_id, date, start_time, end_time
 */
router.post("/booking/create", (req, res) => {
  try {
    const {
      date,
      start_time,
      source = "public"
    } = req.body;

    if (!date || !start_time) {
      return res.status(400).json({ error: "missing_fields" });
    }

    // 🔑 pick ANY existing salon
    const salon = db.prepare(`
      SELECT id FROM salons
      ORDER BY id ASC
      LIMIT 1
    `).get();

    if (!salon) {
      return res.status(500).json({ error: "no_salon_available" });
    }

    // 🔑 pick ANY existing master
    const master = db.prepare(`
      SELECT id FROM masters
      ORDER BY id ASC
      LIMIT 1
    `).get();

    if (!master) {
      return res.status(500).json({ error: "no_master_available" });
    }

    // ⏱ compute end_time (+30 min default slot)
    const end_time = addMinutes(start_time, 30);

    const result = db.prepare(`
      INSERT INTO bookings
        (salon_id, master_id, date, start_time, end_time, source)
      VALUES
        (?, ?, ?, ?, ?, ?)
    `).run(
      salon.id,
      master.id,
      date,
      start_time,
      end_time,
      source
    );

    return res.json({
      ok: true,
      booking_id: result.lastInsertRowid,
      start_time,
      end_time
    });
  } catch (e) {
    console.error("PUBLIC_BOOKING_CREATE_ERROR", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * PUBLIC — READ BOOKING (SAFE)
 */
router.get("/booking/:id", (req, res) => {
  try {
    const booking = db.prepare(`
      SELECT id, date, start_time, end_time
      FROM bookings
      WHERE id = ?
    `).get(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: "not_found" });
    }

    return res.json({ ok: true, booking });
  } catch (e) {
    console.error("PUBLIC_BOOKING_READ_ERROR", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
