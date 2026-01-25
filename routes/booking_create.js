// routes/booking_create.js
import { assertNoOverlap, hhmmToMin } from "../lib/overlap.js";

export function registerBookingCreate(app, db) {

  function minToHHMM(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  app.post("/booking/create", (req, res, next) => {
    const {
      master_slug,
      salon_slug,
      service_id,
      date,
      start_time
    } = req.body || {};

    if (!master_slug || !salon_slug || !service_id || !date || !start_time) {
      return res.status(400).json({ error: "missing_params" });
    }

    try {
      const tx = db.transaction(() => {

        const master = db
          .prepare("SELECT id FROM masters WHERE slug = ?")
          .get(master_slug);
        if (!master) throw { code: 404, msg: "master_not_found" };

        const salon = db
          .prepare("SELECT id FROM salons WHERE slug = ?")
          .get(salon_slug);
        if (!salon) throw { code: 404, msg: "salon_not_found" };

        const service = db
          .prepare(`
            SELECT duration_min
            FROM services
            WHERE id = ? AND active = 1
          `)
          .get(service_id);
        if (!service) throw { code: 404, msg: "service_not_found" };

        const startMin = hhmmToMin(start_time);
        const end_time = minToHHMM(startMin + service.duration_min);

        assertNoOverlap({
          db,
          master_id: master.id,
          salon_id: salon.id,
          date,
          start_time,
          end_time
        });

        const info = db
          .prepare(`
            INSERT INTO bookings
              (master_id, salon_id, service_id, date, start_time, end_time, active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
          `)
          .run(
            master.id,
            salon.id,
            service_id,
            date,
            start_time,
            end_time
          );

        return {
          booking_id: info.lastInsertRowid,
          start_time,
          end_time
        };
      });

      res.json({ ok: true, ...tx() });

    } catch (err) {
      next(err);
    }
  });
}
