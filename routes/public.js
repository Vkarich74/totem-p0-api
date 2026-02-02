// routes/public.js
// Public read-only API (catalog)
// SAFE: no mutations, DB_CONTRACT enforced

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

// health-like ping for public scope
router.get("/ping", (req, res) => {
  res.json({ ok: true, scope: "public" });
});

/**
 * GET /public/catalog
 * Query params:
 * - salon_slug (required)
 *
 * Returns active services with price & duration
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
      WHERE
        sl.slug = $1
        AND sms.active = true
      ORDER BY s.name, m.slug
      `,
      [salon_slug]
    );

    res.json({
      salon_slug,
      services: rows,
    });
  } catch (err) {
    console.error("[PUBLIC CATALOG]", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
