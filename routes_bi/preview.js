import express from "express";
import { db } from "../db/index.js";
import { adapt } from "../bi/index.js";

const router = express.Router();

/**
 * BI source SQL
 * booking = derived entity (marketplace + core)
 */
const ENTITY_SQL = {
  booking: `
    SELECT
      mb.id                 AS id,
      mb.booking_id         AS booking_id,
      b.salon_id            AS salon_id,
      b.master_id           AS master_id,
      b.service_id          AS service_id,
      b.date                AS date,
      b.start_time          AS start_time,
      b.end_time            AS end_time,
      mb.booking_status     AS status,
      mb.price              AS price,
      'USD'                 AS currency,
      b.source              AS source,
      mb.created_at         AS created_at,
      mb.status_changed_at  AS updated_at
    FROM marketplace_bookings mb
    JOIN bookings b ON b.id = mb.booking_id
    LIMIT 50
  `,

  payment: `
    SELECT * FROM booking_payments LIMIT 50
  `,

  payout: `
    SELECT * FROM payouts LIMIT 50
  `,
};

/**
 * GET /system/bi/preview/:entity
 * system-only, read-only, contract-aware
 */
router.get("/bi/preview/:entity", (req, res) => {
  if (req.headers["x-actor-type"] !== "system") {
    return res.status(403).json({ error: "SYSTEM_ONLY" });
  }

  const { entity } = req.params;
  const sql = ENTITY_SQL[entity];

  if (!sql) {
    return res.status(400).json({
      error: "UNKNOWN_ENTITY",
      allowed: Object.keys(ENTITY_SQL),
    });
  }

  try {
    const rows = db.prepare(sql).all();
    const adapted = adapt(entity, rows);

    res.json({
      entity,
      count: adapted.length,
      sample: adapted.slice(0, 5),
    });
  } catch (err) {
    res.status(500).json({
      error: "BI_QUERY_FAILED",
      entity,
      message: err.message,
    });
  }
});

export default router;
