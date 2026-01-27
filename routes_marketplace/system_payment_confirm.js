import express from "express";
import { db } from "../db/index.js";

const router = express.Router();

/**
 * SYSTEM — CONFIRM PAYMENT
 * POST /system/payments/confirm
 */
router.post("/payments/confirm", (req, res) => {
  try {
    // SYSTEM GUARD
    if (req.headers["x-actor-type"] !== "system") {
      return res.status(403).json({ error: "forbidden" });
    }

    if (process.env.SYSTEM_TOKEN) {
      if (req.headers["x-system-token"] !== process.env.SYSTEM_TOKEN) {
        return res.status(403).json({ error: "invalid_system_token" });
      }
    }

    const dryRun = req.query.dry_run === "1";
    const { payment_id } = req.body;

    if (!payment_id) {
      return res.status(400).json({ error: "missing_payment_id" });
    }

    const payment = db.prepare(`
      SELECT id, booking_id, status
      FROM payments
      WHERE id = ?
    `).get(payment_id);

    if (!payment) {
      return res.status(404).json({ error: "payment_not_found" });
    }

    // idempotency
    if (payment.status === "succeeded") {
      return res.json({
        ok: true,
        idempotent: true,
        payment_id: payment.id,
        status: "succeeded"
      });
    }

    if (payment.status !== "pending") {
      return res.status(409).json({ error: "invalid_payment_state" });
    }

    const booking = db.prepare(`
      SELECT id, salon_id, date
      FROM bookings
      WHERE id = ?
    `).get(payment.booking_id);

    if (!booking) {
      return res.status(404).json({ error: "booking_not_found" });
    }

    // MARKETPLACE PRICING (stub)
    const total_amount = 1000;
    const commission_amount = 200;
    const net_amount = total_amount - commission_amount;
    const currency = "USD";

    if (dryRun) {
      return res.json({
        ok: true,
        dry_run: true,
        payment_id: payment.id,
        booking_id: booking.id,
        totals: {
          total_amount,
          commission_amount,
          net_amount,
          currency
        }
      });
    }

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE payments
        SET status = 'succeeded'
        WHERE id = ?
      `).run(payment.id);

      db.prepare(`
        INSERT INTO payouts
          (entity_type, entity_id, period_from, period_to,
           total_paid, total_commission, net_amount, currency,
           status, created_at)
        VALUES
          ('salon', ?, ?, ?,
           ?, ?, ?, ?,
           'pending', datetime('now'))
      `).run(
        booking.salon_id,
        booking.date,
        booking.date,
        total_amount,
        commission_amount,
        net_amount,
        currency
      );
    });

    tx();

    return res.json({
      ok: true,
      payment_id: payment.id,
      status: "succeeded"
    });
  } catch (e) {
    console.error("SYSTEM_PAYMENT_CONFIRM_ERROR", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
