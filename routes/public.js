// routes/public.js
// Public API: catalog + payments (read/write limited)

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

// health-like ping
router.get("/ping", (req, res) => {
  res.json({ ok: true, scope: "public" });
});

/**
 * GET /public/catalog
 */
router.get("/catalog", async (req, res) => {
  const { salon_slug } = req.query;
  if (!salon_slug) {
    return res.status(400).json({ error: "salon_slug is required" });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT
        s.service_id,
        s.name,
        sms.price,
        sms.duration_min,
        m.slug AS master_slug
      FROM salon_master_services sms
      JOIN salons sl ON sl.id = sms.salon_id
      JOIN masters m ON m.id = sms.master_id
      JOIN services s ON s.id = sms.service_pk
      WHERE sl.slug = $1 AND sms.active = true
      ORDER BY s.name, m.slug
      `,
      [salon_slug]
    );

    res.json({ salon_slug, services: rows });
  } catch (e) {
    console.error("[CATALOG]", e);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /public/payments/start
 * STUB implementation (provider later)
 */
router.post("/payments/start", async (req, res) => {
  const { booking_id, return_url } = req.body;

  if (!booking_id || !return_url) {
    return res.status(400).json({ error: "booking_id and return_url required" });
  }

  try {
    // ensure booking exists and is pending_payment
    const { rows } = await pool.query(
      `SELECT id, status FROM bookings WHERE id = $1`,
      [booking_id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "booking_not_found" });
    }

    if (rows[0].status !== "pending_payment") {
      return res.status(409).json({ error: "invalid_booking_status" });
    }

    // STUB payment url (provider integration later)
    const paymentUrl =
      return_url +
      (return_url.includes("?") ? "&" : "?") +
      "payment=stub&booking_id=" +
      booking_id;

    res.json({
      ok: true,
      payment_url: paymentUrl,
    });
  } catch (e) {
    console.error("[PAYMENTS START]", e);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
