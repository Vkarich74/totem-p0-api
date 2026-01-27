import express from "express";
import { db } from "../db/index.js";

const router = express.Router();

/**
 * Ensure payments table exists (P5.2 public intent)
 * Idempotent. Safe.
 */
db.prepare(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`).run();

/**
 * PUBLIC — CREATE PAYMENT INTENT
 * Rules:
 * - booking_id required
 * - booking must exist
 * - only ONE payment per booking
 * - no amount from client
 */
router.post("/payment/create", (req, res) => {
  try {
    const { booking_id, provider = "public" } = req.body;

    if (!booking_id) {
      return res.status(400).json({ error: "missing_booking_id" });
    }

    // booking must exist
    const booking = db.prepare(`
      SELECT id
      FROM bookings
      WHERE id = ?
    `).get(booking_id);

    if (!booking) {
      return res.status(404).json({ error: "booking_not_found" });
    }

    // anti-bypass: only one payment per booking
    const existing = db.prepare(`
      SELECT id
      FROM payments
      WHERE booking_id = ?
      LIMIT 1
    `).get(booking_id);

    if (existing) {
      return res.status(409).json({ error: "payment_already_exists" });
    }

    const result = db.prepare(`
      INSERT INTO payments
        (booking_id, provider, status, created_at)
      VALUES
        (?, ?, 'pending', datetime('now'))
    `).run(
      booking_id,
      provider
    );

    return res.json({
      ok: true,
      payment_id: result.lastInsertRowid,
      status: "pending"
    });
  } catch (e) {
    console.error("PUBLIC_PAYMENT_CREATE_ERROR", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

/**
 * PUBLIC — READ PAYMENT (READ-ONLY)
 */
router.get("/payment/:id", (req, res) => {
  try {
    const payment = db.prepare(`
      SELECT id, booking_id, status, provider, created_at
      FROM payments
      WHERE id = ?
    `).get(req.params.id);

    if (!payment) {
      return res.status(404).json({ error: "not_found" });
    }

    return res.json({ ok: true, payment });
  } catch (e) {
    console.error("PUBLIC_PAYMENT_READ_ERROR", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
