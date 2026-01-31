// routes_public/masters.js
// Public read-only masters by salon — CANONICAL v1
// GET /public/salons/:slug/masters

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
      SELECT m.slug AS master_slug, m.name
      FROM masters m
      WHERE m.salon_slug = $1
      ORDER BY m.name ASC
      `,
      [salonSlug]
    );

    return res.status(200).json(
      rows.map((r) => ({
        master_slug: r.master_slug,
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
