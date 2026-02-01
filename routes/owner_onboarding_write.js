// routes/owner_onboarding_write.js
import express from "express";
import db from "../db/index.js";
import { requireOwner } from "../middleware/auth_owner.js";

const router = express.Router();

router.post("/link", requireOwner, (req, res) => {
  const { salon_id, master_id, service_pk, price, duration_min, active } = req.body;

  if (!salon_id || !master_id || !service_pk || price == null || !duration_min) {
    return res.status(400).json({ error: "invalid payload" });
  }

  const stmt = db.prepare(`
    INSERT INTO salon_master_services
      (salon_id, master_id, service_pk, price, duration_min, active)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (salon_id, master_id, service_pk)
    DO UPDATE SET
      price = excluded.price,
      duration_min = excluded.duration_min,
      active = excluded.active
    RETURNING id
  `);

  const row = stmt.get(
    salon_id,
    master_id,
    service_pk,
    price,
    duration_min,
    active !== false
  );

  res.json({ ok: true, sms_id: row.id });
});

export default router;
