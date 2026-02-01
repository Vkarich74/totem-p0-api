// routes/owner_onboarding_readonly.js
import express from "express";
import * as db from "../db/index.js";
import { requireOwner } from "../middleware/auth_owner.js";

const router = express.Router();

router.get("/salons", requireOwner, (req, res) => {
  const rows = db.default
    ? db.default.prepare(
        "SELECT id, slug, name, enabled FROM salons ORDER BY id"
      ).all()
    : db.prepare(
        "SELECT id, slug, name, enabled FROM salons ORDER BY id"
      ).all();

  res.json(rows);
});

router.get("/salons/:salonId/masters", requireOwner, (req, res) => {
  const salonId = Number(req.params.salonId);

  const rows = (db.default || db)
    .prepare(
      `
      SELECT DISTINCT
        m.id,
        m.slug,
        m.name,
        m.active
      FROM salon_master_services sms
      JOIN masters m ON m.id = sms.master_id
      WHERE sms.salon_id = ?
      ORDER BY m.id
      `
    )
    .all(salonId);

  res.json(rows);
});

router.get(
  "/salons/:salonId/masters/:masterId/services",
  requireOwner,
  (req, res) => {
    const salonId = Number(req.params.salonId);
    const masterId = Number(req.params.masterId);

    const rows = (db.default || db)
      .prepare(
        `
        SELECT
          sms.id           AS sms_id,
          s.service_id     AS service_id,
          s.name           AS name,
          sms.price,
          sms.duration_min,
          sms.active
        FROM salon_master_services sms
        JOIN services s ON s.id = sms.service_pk
        WHERE sms.salon_id = ?
          AND sms.master_id = ?
        ORDER BY sms.id
        `
      )
      .all(salonId, masterId);

    res.json(rows);
  }
);

export default router;
