import express from "express";
import { pool } from "../db/index.js";
import systemOwnerGuard from "../middleware/system_owner_guard.js";

const router = express.Router();

/**
 * GET /owner/audit
 * Owner audit log (scoped by salon_slug)
 */
router.get("/audit", systemOwnerGuard, async (req, res) => {
  const { salon_slug } = req.user;

  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  const offset = parseInt(req.query.offset || "0", 10);

  const {
    action_type,
    entity_type,
    entity_id,
    from,
    to,
  } = req.query;

  const conditions = ["salon_slug = $1"];
  const values = [salon_slug];
  let idx = 2;

  if (action_type) {
    conditions.push(`action_type = $${idx++}`);
    values.push(action_type);
  }

  if (entity_type) {
    conditions.push(`entity_type = $${idx++}`);
    values.push(entity_type);
  }

  if (entity_id) {
    conditions.push(`entity_id = $${idx++}`);
    values.push(entity_id);
  }

  if (from) {
    conditions.push(`created_at >= $${idx++}`);
    values.push(from);
  }

  if (to) {
    conditions.push(`created_at <= $${idx++}`);
    values.push(to);
  }

  const whereClause = conditions.join(" AND ");

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        created_at,
        actor_email,
        action_type,
        entity_type,
        entity_id,
        request_id,
        metadata
      FROM owner_actions_audit_log
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx++}
      OFFSET $${idx}
      `,
      [...values, limit, offset]
    );

    res.json({
      ok: true,
      items: result.rows,
      page: {
        limit,
        offset,
        count: result.rowCount,
      },
    });
  } catch (err) {
    console.error("OWNER_AUDIT_READ_ERROR", err);
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default router;
