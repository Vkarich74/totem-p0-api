import crypto from "node:crypto";
import { validateRange, findOverlap } from "../lib/overlap.js";

export function registerMarketplaceBookingCreate(app, db) {
  app.post("/marketplace/booking/create", (req, res) => {
    const { salon_slug, master_slug, service_id, day } = req.body;
    const startMin = Number(req.body?.start_min);
    const endMin = Number(req.body?.end_min);

    if (!salon_slug || !master_slug || !service_id || !day) {
      return res.status(400).json({ ok: false, error: "missing_fields" });
    }

    const vr = validateRange(startMin, endMin);
    if (!vr.ok) return res.status(400).json({ ok: false, error: vr.error });

    const existing = db.all(
      `SELECT booking_id, start_min, end_min
       FROM marketplace_bookings
       WHERE salon_slug = ? AND master_slug = ? AND day = ?`,
      [salon_slug, master_slug, day]
    );

    const conflict = findOverlap(existing, startMin, endMin);
    if (conflict) {
      return res.status(409).json({
        ok: false,
        error: "time_overlap",
        conflict,
      });
    }

    const bookingId = "bk_" + crypto.randomBytes(6).toString("hex");

    db.run(
      `INSERT INTO marketplace_bookings
       (booking_id, salon_slug, master_slug, service_id, day, start_min, end_min, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bookingId,
        salon_slug,
        master_slug,
        service_id,
        day,
        startMin,
        endMin,
        new Date().toISOString(),
      ]
    );

    res.json({ ok: true, booking_id: bookingId });
  });
}
