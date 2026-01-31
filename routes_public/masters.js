// routes_public/masters.js
// Public read-only masters list — CANONICAL v1
// GET /public/salons/:slug/masters
// NOTE: v1 returns all active masters (no salon binding in DB yet)

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

router.get("/:slug/masters", async (req, res) => {
  const salonSlug = req.params.slug;

  if (!salonSlug || typeof salonSlug !== "string") {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `
      SELECT slug, name
      FROM masters
      WHERE active = true
      ORDER BY name ASC
      `
    );

    return res.status(200).json(
      rows.map((r) => ({
        master_slug: r.slug,
        name: r.name,
      }))
    );
  } catch (err) {
    console.error("masters:list error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  } finally {
    client.release();
  }
});

export default router;
