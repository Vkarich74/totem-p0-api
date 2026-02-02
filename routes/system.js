// routes/system.js
// System-level endpoints: payments, booking lifecycle
// AUTH: X-System-Token

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

// =====================
// SYSTEM AUTH
// =====================
router.use((req, res, next) => {
  const token = req.header("X-System-Token");
  if (!token || token !== process.env.SYSTEM_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

// ======================================================
// POST /system/payments/webhook
// ======================================================
router.post("/payments/webhook", async (req, res) => {
  const { booking_id, status } = req.body;
  if (!booking_id || !status) {
    return res.status(400).json({ error: "booking_id_and_status_required" });
  }

  try {
    if (status === "succeeded") {
      const r = await pool.query(
        `UPDATE bookings SET status='paid'
         WHERE id=$1 AND status='pending_payment'
         RETURNING id`,
        [booking_id]
      );
      if (!r.rowCount) {
        const cur = await pool.query(`SELECT status FROM bookings WHERE id=$1`, [booking_id]);
        if (!cur.rowCount) return res.status(404).json({ error: "booking_not_found" });
        return res.status(409).json({ error: "invalid_booking_status", currentStatus: cur.rows[0].status });
      }
      return res.json({ ok: true });
    }

    if (status === "failed") {
      const r = await pool.query(
        `UPDATE bookings SET status='cancelled'
         WHERE id=$1 AND status='pending_payment'
         RETURNING id`,
        [booking_id]
      );
      if (!r.rowCount) {
        const cur = await pool.query(`SELECT status FROM bookings WHERE id=$1`, [booking_id]);
        if (!cur.rowCount) return res.status(404).json({ error: "booking_not_found" });
        return res.status(409).json({ error: "invalid_booking_status", currentStatus: cur.rows[0].status });
      }
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "invalid_status_value" });
  } catch (e) {
    console.error("[SYSTEM PAYMENTS WEBHOOK]", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

// ======================================================
// POST /system/bookings/complete
// ======================================================
router.post("/bookings/complete", async (req, res) => {
  const { booking_id } = req.body;
  if (!booking_id) return res.status(400).json({ error: "booking_id_required" });

  try {
    // 1) жёстко пытаемся завершить только paid
    const r = await pool.query(
      `UPDATE bookings SET status='completed'
       WHERE id=$1 AND status='paid'
       RETURNING id`,
      [booking_id]
    );

    if (r.rowCount === 1) {
      // audit — best effort
      try {
        await pool.query(
          `INSERT INTO booking_audit_log (booking_id, from_status, to_status, source)
           VALUES ($1, 'paid', 'completed', '/system/bookings/complete')`,
          [booking_id]
        );
      } catch (_) {}
      return res.json({ ok: true });
    }

    // 2) если не обновилось — выясняем почему
    const cur = await pool.query(`SELECT status FROM bookings WHERE id=$1`, [booking_id]);
    if (!cur.rowCount) return res.status(404).json({ error: "booking_not_found" });

    if (cur.rows[0].status === "completed") {
      return res.json({ ok: true, noop: true });
    }

    return res.status(409).json({ error: "invalid_booking_status", currentStatus: cur.rows[0].status });
  } catch (e) {
    console.error("[SYSTEM BOOKING COMPLETE]", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
