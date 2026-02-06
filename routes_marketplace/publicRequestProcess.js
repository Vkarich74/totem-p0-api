// routes_marketplace/publicRequestProcess.js — B3.5 FINAL (booking + commission)
import express from "express";
import { openDb } from "../db/index.js";

const router = express.Router();
const COMMISSION_RATE = 0.10;

router.post("/public/requests/:id/process", (req, res) => {
  const db = openDb();

  try {
    // =====================
    // AUTH
    // =====================
    const actor = String(req.headers["x-actor-type"] || "").toLowerCase();
    if (actor !== "system") {
      return res.status(403).json({ error: "SYSTEM_ONLY" });
    }

    const requestId = Number(req.params.id);
    if (!requestId) {
      return res.status(400).json({ error: "INVALID_REQUEST_ID" });
    }

    // =====================
    // LOAD REQUEST
    // =====================
    const reqRow = db.prepare(`
      SELECT
        request_id,
        salon_id,
        master_slug,
        service_id,
        price,
        date,
        start_time,
        end_time
      FROM public_booking_requests
      WHERE request_id = ?
    `).get(requestId);

    if (!reqRow) {
      return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
    }

    // =====================
    // PAYMENT MUST EXIST
    // =====================
    const intent = db.prepare(`
      SELECT intent_id
      FROM public_payment_intents
      WHERE request_id = ?
    `).get(requestId);

    if (!intent) {
      return res.status(409).json({ error: "PAYMENT_NOT_FOUND" });
    }

    // =====================
    // IDEMPOTENCY
    // =====================
    const done = db.prepare(`
      SELECT booking_id
      FROM public_idempotency
      WHERE request_id = ?
    `).get(requestId);

    if (done && done.booking_id) {
      const commission = db.prepare(`
        SELECT amount
        FROM marketplace_commissions
        WHERE booking_id = ?
      `).get(done.booking_id);

      return res.json({
        ok: true,
        request_id: requestId,
        booking_id: done.booking_id,
        commission: commission ? commission.amount : 0,
        idempotent: true
      });
    }

    // =====================
    // MASTER
    // =====================
    const master = db.prepare(`
      SELECT id
      FROM masters
      WHERE slug = ?
    `).get(reqRow.master_slug);

    if (!master) {
      return res.status(409).json({ error: "MASTER_NOT_FOUND" });
    }

    // =====================
    // CREATE BOOKING
    // =====================
    const bookingRes = db.prepare(`
      INSERT INTO bookings
        (salon_id, master_id, service_id, date, start_time, end_time)
      VALUES
        (?, ?, ?, ?, ?, ?)
    `).run(
      reqRow.salon_id,
      master.id,
      reqRow.service_id,
      reqRow.date,
      reqRow.start_time,
      reqRow.end_time
    );

    const bookingId = bookingRes.lastInsertRowid;

    // =====================
    // COMMISSION
    // =====================
    const commissionAmount = Math.round((reqRow.price || 0) * COMMISSION_RATE);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR IGNORE INTO marketplace_commissions
        (booking_id, request_id, amount, rate, created_at)
      VALUES
        (?, ?, ?, ?, ?)
    `).run(
      bookingId,
      requestId,
      commissionAmount,
      COMMISSION_RATE,
      now
    );

    // =====================
    // IDEMPOTENCY BIND
    // =====================
    db.prepare(`
      INSERT OR REPLACE INTO public_idempotency
        (token_id, idem_key, request_id, booking_id, created_at)
      VALUES
        (0, ?, ?, ?, ?)
    `).run(
      `process:${requestId}`,
      requestId,
      bookingId,
      now
    );

    return res.json({
      ok: true,
      request_id: requestId,
      booking_id: bookingId,
      commission: commissionAmount
    });
  } catch (e) {
    console.error("B3.5 process error:", e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  } finally {
    db.close();
  }
});

export default router;
