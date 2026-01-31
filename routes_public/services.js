// routes_public/services.js
// Public read-only services by master — CANONICAL v1
// GET /public/masters/:slug/services
// NOTE: v1 returns all services (no master binding in DB yet)

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

router.get("/:slug/services", async (req, res) => {
  const masterSlug = req.params.slug;

  if (!masterSlug || typeof masterSlug !== "string") {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
      SELECT service_id, name, duration_min, price
      FROM services
      ORDER BY name ASC
      `
    );

    return res.status(200).json(
      rows.map((r) => ({
        service_id: r.service_id,
        name: r.name,
        duration_min: r.duration_min,
        price: r.price,
      }))
    );
  } catch (err) {
    console.error("services:list error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  } finally {
    client.release();
  }
});

export default router;
