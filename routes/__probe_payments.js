import express from "express";
import db from "../db/index.js";

const router = express.Router();

router.post("/__probe/payments", async (req, res) => {
  try {
    const { booking_id } = req.body;
    if (typeof booking_id !== "number") {
      return res.status(400).json({ error: "invalid_booking_id" });
    }
    if (!db || db.mode !== "postgres") {
      return res.status(500).json({ error: "db_mode_error", mode: db && db.mode });
    }

    const all = await db.query(
      `SELECT id, booking_id, status, amount, created_at FROM payments WHERE booking_id = $1 ORDER BY id ASC`,
      [booking_id]
    );

    const byStatus = await db.query(
      `SELECT status, count(*)::int AS cnt FROM payments WHERE booking_id = $1 GROUP BY status`,
      [booking_id]
    );

    return res.json({
      ok: true,
      booking_id,
      rows: all.rows,
      statuses: byStatus.rows
    });
  } catch (e) {
    return res.status(500).json({ error: "fatal", message: e.message });
  }
});

export default router;
