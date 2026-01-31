// utils/auditOwnerAction.js
// CONTRACT:
// - Must be called AFTER successful owner action
// - Never throws (audit must not break prod flows)
// - Requires api_guard to have populated req.user
// - Uses Postgres pool directly

import { pool } from "../db/index.js";

export async function auditOwnerAction({
  req,
  action_type,
  entity_type,
  entity_id = null,
  metadata = null,
}) {
  try {
    if (!req || !req.user) {
      return; // silent fail — misuse protection
    }

    const user = req.user;

    const salon_slug = user.salon_slug;
    const actor_user_id = user.id;
    const actor_email = user.email;
    const request_id = req.request_id || null;

    await pool.query(
      `
      INSERT INTO owner_actions_audit_log
        (salon_slug,
         actor_user_id,
         actor_email,
         action_type,
         entity_type,
         entity_id,
         request_id,
         metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [
        salon_slug,
        actor_user_id,
        actor_email,
        action_type,
        entity_type,
        entity_id,
        request_id,
        metadata,
      ]
    );
  } catch (err) {
    // AUDIT MUST NEVER BREAK PROD
    console.error("[AUDIT_OWNER_ACTION_FAILED]", err.message);
  }
}
