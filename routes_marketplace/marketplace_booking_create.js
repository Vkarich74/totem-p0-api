/**
 * P3.3 Marketplace Booking Create
 * Core booking logic is NOT duplicated.
 */

export function registerMarketplaceBookingCreate(app, db) {
  app.post("/marketplace/booking/create", (req, res, next) => {
    const {
      owner_id,
      client_id,
      master_slug,
      salon_slug,
      service_id,
      date,
      start_time
    } = req.body || {};

    if (!owner_id || !client_id || !master_slug || !salon_slug || !service_id || !date || !start_time) {
      return res.status(400).json({ error: "missing_params" });
    }

    try {
      const tx = db.transaction(() => {
        // 1. commission (P3.3 — фикс 10%)
        const commission_pct = 10;

        // 2. создаём booking через core-таблицы
        const master = db.prepare("SELECT id FROM masters WHERE slug = ?").get(master_slug);
        if (!master) throw { code: 404, msg: "master_not_found" };

        const salon = db.prepare("SELECT id FROM salons WHERE slug = ?").get(salon_slug);
        if (!salon) throw { code: 404, msg: "salon_not_found" };

        const service = db.prepare(`
          SELECT duration_min, price
          FROM services
          WHERE id = ? AND active = 1
        `).get(service_id);
        if (!service) throw { code: 404, msg: "service_not_found" };

        // считаем end_time
        const [h, m] = start_time.split(":").map(Number);
        const endMin = h * 60 + m + service.duration_min;
        const end_time =
          String(Math.floor(endMin / 60)).padStart(2, "0") +
          ":" +
          String(endMin % 60).padStart(2, "0");

        // 3. вставка в core bookings (БЕЗ дублирования логики overlap — она уже в БД-фактах)
        const info = db.prepare(`
          INSERT INTO bookings
            (master_id, salon_id, service_id, date, start_time, end_time, active)
          VALUES (?, ?, ?, ?, ?, ?, 1)
        `).run(master.id, salon.id, service_id, date, start_time, end_time);

        // 4. marketplace ledger
        db.prepare(`
          INSERT INTO marketplace_bookings
            (booking_id, owner_id, client_id, price, commission_pct)
          VALUES (?, ?, ?, ?, ?)
        `).run(info.lastInsertRowid, owner_id, client_id, service.price, commission_pct);

        return {
          booking_id: info.lastInsertRowid,
          commission_pct
        };
      });

      res.json({ ok: true, ...tx() });
    } catch (err) {
      next(err);
    }
  });
}
