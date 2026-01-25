// routes/blocks_create.js
import { assertNoOverlap } from "../lib/overlap.js";

export function registerBlocksCreate(app, db) {

  app.post("/blocks/create", (req, res, next) => {
    const {
      master_slug,
      salon_slug,
      date,
      start_time,
      end_time,
      reason
    } = req.body || {};

    if (!master_slug || !salon_slug || !date || !start_time || !end_time) {
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

        assertNoOverlap({
          db,
          master_id: master.id,
          salon_id: salon.id,
          date,
          start_time,
          end_time
        });

        const info = db.prepare(`
          INSERT INTO blocks
            (master_id, salon_id, date, start_time, end_time, reason, active)
          VALUES (?, ?, ?, ?, ?, ?, 1)
        `).run(
          master.id,
          salon.id,
          date,
          start_time,
          end_time,
          reason || null
        );

        return { block_id: info.lastInsertRowid };
      });

      res.json({ ok: true, ...tx() });

    } catch (err) {
      next(err);
    }
  });
}
