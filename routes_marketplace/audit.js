import express from "express";
import { db } from "../db/index.js";

const router = express.Router();

/**
 * SYSTEM AUDIT — READ ONLY
 * Requires X-Actor-Type: system
 */
router.get("/", (req, res) => {
  try {
    if (req.headers["x-actor-type"] !== "system") {
      return res.status(403).json({ error: "forbidden" });
    }

    const rows = db.prepare(`
      SELECT
        id,
        actor_type,
        actor_id,
        action,
        entity_type,
        entity_id,
        meta,
        created_at
      FROM audit_log
      ORDER BY id DESC
      LIMIT 100
    `).all();

    return res.json({ ok: true, rows });
  } catch (e) {
    console.error("AUDIT_READ_ERROR", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
