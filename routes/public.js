// routes/public.js
// Public API: salons, catalog, bookings, payments
// SAFE: limited write, DB_CONTRACT enforced

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

// ping
router.get("/ping", (req, res) => {
  res.json({ ok: true, scope: "public" });
});

/**
 * GET /public/salons/:salon_slug
 * Used by Odoo demo block to show salon name
 */
router.get("/salons/:salon_slug", async (req, res) => {
  const { salon_slug } = req.params;
  if (!salon_slug) {
    return res.status(400).json({ error: "salon_slug is required" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT slug, name, enabled FROM salons WHERE slug = $1 LIMIT 1`,
      [salon_slug]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "salon_not_found" });
    }

    res.json({
      ok: true,
      slug: rows[0].slug,
      name: rows[0].name,
      enabled: rows[0].enabled,
    });
  } catch (e) {
    console.error("[PUBLIC SALON]", e);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /public/catalog?salon_slug=
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
 * POST /public/bookings
 */
router.post("/bookings", async (req, res) => {
  const {
    salon_slug,
    master_slug,
    service_id,
    date,
    start_time,
    request_id,
  } = req.body;

  if (!salon_slug || !master_slug || !service_id || !date || !start_time) {
    return res.status(400).json({ error: "missing_fields" });
  }

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO bookings
        (salon_slug, master_slug, service_id, date, start_time, status, request_id)
      VALUES
        ($1, $2, $3, $4, $5, 'pending_payment', $6)
      RETURNING id, status
      `,
      [salon_slug, master_slug, service_id, date, start_time, request_id || null]
    );

    res.json({ ok: true, booking_id: rows[0].id, status: rows[0].status });
  } catch (e) {
    console.error("[BOOKINGS]", e);
    if (e.code === "23505") {
      return res.status(409).json({ error: "duplicate_request" });
    }
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /public/payments/start (STUB)
 */
router.post("/payments/start", async (req, res) => {
  const { booking_id, return_url } = req.body;

  if (!booking_id || !return_url) {
    return res.status(400).json({ error: "booking_id and return_url required" });
  }

  try {
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

    const paymentUrl =
      return_url +
      (return_url.includes("?") ? "&" : "?") +
      "payment=stub&booking_id=" +
      booking_id;

    res.json({ ok: true, payment_url: paymentUrl });
  } catch (e) {
    console.error("[PAYMENTS START]", e);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /public/payments/status?booking_id=
 */
router.get("/payments/status", async (req, res) => {
  const { booking_id } = req.query;

  if (!booking_id) {
    return res.status(400).json({ error: "booking_id is required" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT status FROM bookings WHERE id = $1`,
      [booking_id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "booking_not_found" });
    }

    res.json({ booking_id: Number(booking_id), status: rows[0].status });
  } catch (e) {
    console.error("[PAYMENTS STATUS]", e);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
