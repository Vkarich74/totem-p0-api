import express from "express";
import db from "../db/index.js";

const router = express.Router();

/**
 * POST /__debug/db/payments
 * Input: { booking_id }
 * Возвращает реальные строки из payments
 */
router.post("/__debug/db/payments", async (req, res) => {
  try {
    const { booking_id } = req.body;

    if (typeof booking_id !== "number") {
      return res.status(400).json({ error: "invalid_booking_id" });
    }

    if (!db || db.mode !== "postgres") {
      return res.status(500).json({ error: "db_mode_error", mode: db && db.mode });
    }

    // 1. все payments по booking_id
    const all = await db.query(
      `
      SELECT *
      FROM payments
      WHERE booking_id = $1
      ORDER BY id ASC
      `,
      [booking_id]
    );

    // 2. distinct statuses
    const statuses = await db.query(
      `
      SELECT DISTINCT status
      FROM payments
      WHERE booking_id = $1
      `,
      [booking_id]
    );

    // 3. succeeded only
    const succeeded = await db.query(
      `
      SELECT *
      FROM payments
      WHERE booking_id = $1
        AND status = 'succeeded'
      ORDER BY id DESC
      `,
      [booking_id]
    );

    return res.json({
      ok: true,
      booking_id,
      total_rows: all.rows.length,
      rows: all.rows,
      distinct_statuses: statuses.rows,
      succeeded_rows: succeeded.rows
    });
  } catch (e) {
    console.error("DEBUG_DB_PAYMENTS_FATAL", e);
    return res.status(500).json({ error: "fatal", message: e.message });
  }
});

export default router;
