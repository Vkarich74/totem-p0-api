import express from "express";
import { pool } from "../db/index.js";

const router = express.Router();

/**
 * GET /owner
 * Protected owner dashboard (v1 stub)
 */
router.get("/owner", async (req, res) => {
  const client = await pool.connect();
  try {
    // Minimal sanity check: DB reachable + user injected by guard
    const result = await client.query("SELECT 1");

    res.json({
      ok: true,
      role: req.user.role,
      binding:
        req.user.role === "salon_admin"
          ? { salon_slug: req.user.salon_slug }
          : { master_slug: req.user.master_slug },
    });
  } finally {
    client.release();
  }
});

export default router;
