// routes_marketplace/publicRequests.js
import express from "express";

export default function mountPublicRequests(app, { db }) {
  const router = express.Router();

  router.post("/marketplace/public/requests/:id/process", (req, res) => {
    if (String(req.headers["x-actor-type"]) !== "system") {
      return res.status(403).json({ error: "SYSTEM_ONLY" });
    }

    const id = Number(req.params.id);
    const row = db
      .prepare(`SELECT * FROM public_booking_requests WHERE request_id = ?`)
      .get(id);

    if (!row) return res.status(404).json({ error: "NOT_FOUND" });
    if (row.status !== "pending") {
      return res.status(409).json({ error: "REQUEST_ALREADY_PROCESSED" });
    }

    const overlap = db
      .prepare(
        `
        SELECT 1 FROM bookings
        WHERE salon_id = ?
          AND master_slug = ?
          AND date = ?
          AND cancelled_at IS NULL
          AND NOT (end_time <= ? OR start_time >= ?)
      `
      )
      .get(
        row.salon_id,
        row.master_slug,
        row.date,
        row.start_time,
        row.end_time
      );

    if (overlap) {
      db.prepare(
        `
        UPDATE public_booking_requests
        SET status = 'rejected', processed_at = ?
        WHERE request_id = ?
      `
      ).run(new Date().toISOString(), id);

      return res.status(409).json({ error: "SLOT_BUSY" });
    }

    const r = db
      .prepare(
        `
        INSERT INTO bookings (
          salon_id, master_slug,
          service_id, duration_min, price,
          date, start_time, end_time,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        row.salon_id,
        row.master_slug,
        row.service_id,
        row.duration_min,
        row.price,
        row.date,
        row.start_time,
        row.end_time,
        new Date().toISOString()
      );

    db.prepare(
      `
      UPDATE public_booking_requests
      SET status = 'processed',
          processed_at = ?,
          booking_id = ?
      WHERE request_id = ?
    `
    ).run(new Date().toISOString(), r.lastInsertRowid, id);

    return res.json({
      ok: true,
      booking_id: r.lastInsertRowid,
      price: row.price,
    });
  });

  app.use(router);
}
