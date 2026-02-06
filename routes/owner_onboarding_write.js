// routes/owner_onboarding_write.js
import express from "express";
import db from "../db/index.js";
import { requireOwner } from "../middleware/auth_owner.js";

const router = express.Router();

router.post("/link", requireOwner, async (req, res) => {
  const { salon_id, master_id, service_pk, price, duration_min, active } = req.body;

  if (!salon_id || !master_id || !service_pk || price == null || !duration_min) {
    return res.status(400).json({ error: "invalid payload" });
  }

  try {
    const q = `
      INSERT INTO salon_master_services
        (salon_id, master_id, service_pk, price, duration_min, active)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (salon_id, master_id, service_pk)
      DO UPDATE SET
        price = EXCLUDED.price,
        duration_min = EXCLUDED.duration_min,
        active = EXCLUDED.active
      RETURNING id
    `;
    const params = [
      salon_id,
      master_id,
      service_pk,
      price,
      duration_min,
      active !== false,
    ];

    const { rows } = await db.query(q, params);
    return res.json({ ok: true, sms_id: rows[0].id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "db error" });
  }
});

export default router;
