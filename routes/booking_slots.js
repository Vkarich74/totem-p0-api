// routes/booking_slots.js
export function registerBookingSlots(app, db) {

  function hhmmToMin(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  function minToHHMM(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function getWeekday(dateStr) {
    return new Date(dateStr + "T00:00:00").getDay(); // 0–6
  }

  app.get("/booking/slots", (req, res) => {
    try {
      const { master_slug, salon_slug, date, service_id } = req.query;

      if (!master_slug || !salon_slug || !date) {
        return res.status(400).json({ error: "missing_params" });
      }

      const weekday = getWeekday(date);

      const master = db
        .prepare("SELECT id FROM masters WHERE slug = ?")
        .get(master_slug);
      if (!master) return res.status(404).json({ error: "master_not_found" });

      const salon = db
        .prepare("SELECT id FROM salons WHERE slug = ?")
        .get(salon_slug);
      if (!salon) return res.status(404).json({ error: "salon_not_found" });

      let durationMin = 30;

      if (service_id) {
        const service = db
          .prepare(
            "SELECT id, duration_min FROM services WHERE id = ? AND active = 1"
          )
          .get(service_id);

        if (!service) {
          return res.status(404).json({ error: "service_not_found" });
        }

        durationMin = Number(service.duration_min);
      }

      const STEP = 30;

      const schedule = db
        .prepare(`
          SELECT start_time, end_time
          FROM master_schedule
          WHERE master_id = ?
            AND salon_id = ?
            AND weekday = ?
            AND active = 1
          ORDER BY start_time
        `)
        .all(master.id, salon.id, weekday);

      if (!schedule.length) {
        return res.json({
          ok: true,
          date,
          weekday,
          step_min: STEP,
          duration_min: durationMin,
          slots: []
        });
      }

      const bookings = db
        .prepare(`
          SELECT start_time, end_time
          FROM bookings
          WHERE master_id = ?
            AND salon_id = ?
            AND date = ?
            AND active = 1
            AND cancelled_at IS NULL
        `)
        .all(master.id, salon.id, date)
        .map(b => ({
          start: hhmmToMin(b.start_time),
          end: hhmmToMin(b.end_time)
        }));

      const slots = [];

      for (const row of schedule) {
        const segStart = hhmmToMin(row.start_time);
        const segEnd = hhmmToMin(row.end_time);

        let t = segStart;
        const mod = t % STEP;
        if (mod !== 0) t += STEP - mod;

        while (t + durationMin <= segEnd) {
          const start = t;
          const end = t + durationMin;

          let ok = true;
          for (const b of bookings) {
            if (overlaps(start, end, b.start, b.end)) {
              ok = false;
              break;
            }
          }

          if (ok) {
            slots.push({
              start_time: minToHHMM(start),
              end_time: minToHHMM(end)
            });
          }

          t += STEP;
        }
      }

      res.json({
        ok: true,
        date,
        weekday,
        step_min: STEP,
        duration_min: durationMin,
        slots
      });

    } catch (e) {
      console.error("SLOTS ERROR:", e);
      res.status(500).json({ error: "internal_error" });
    }
  });
}
