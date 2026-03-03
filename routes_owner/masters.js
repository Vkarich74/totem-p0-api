// routes_owner/masters.js
// Owner masters endpoint (backend-driven)
// GET /salons/:slug/masters

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
    // 1. Find salon
    const salonResult = await client.query(
      `
      SELECT id
      FROM salons
      WHERE slug = $1
        AND enabled = true
        AND status = 'active'
      LIMIT 1
      `,
      [salonSlug]
    );

    if (salonResult.rowCount === 0) {
      return res.status(404).json({ error: "SALON_NOT_FOUND" });
    }

    const salonId = salonResult.rows[0].id;

    // 2. Join masters via pivot
    const { rows } = await client.query(
      `
      SELECT 
        m.id,
        m.slug,
        m.name,
        m.active,
        ms.status,
        ms.activated_at,
        ms.fired_at
      FROM master_salon ms
      JOIN masters m ON m.id = ms.master_id
      WHERE ms.salon_id = $1
      ORDER BY m.name ASC
      `,
      [salonId]
    );

    return res.status(200).json(
      rows.map((r) => ({
        id: r.id,
        master_slug: r.slug,
        name: r.name,
        active: r.active,
        status: r.status,
        activated_at: r.activated_at,
        fired_at: r.fired_at,
      }))
    );
  } catch (err) {
    console.error("owner masters:list error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  } finally {
    client.release();
  }
});

export default router;