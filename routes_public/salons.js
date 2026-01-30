// routes_public/salons.js
// Public read-only salons API — CANONICAL v1
// GET /public/salons/:slug

import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

router.get("/:slug", async (req, res) => {
  const slug = req.params.slug;

  if (!slug || typeof slug !== "string") {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const client = await pool.connect();
  try {
    const { rows, rowCount } = await client.query(
      `
      SELECT slug, name
      FROM salons
      WHERE slug = $1
      LIMIT 1
      `,
      [slug]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    return res.status(200).json({
      slug: rows[0].slug,
      name: rows[0].name,
    });
  } catch (err) {
    console.error("salons:get error:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  } finally {
    client.release();
  }
});

export default router;
