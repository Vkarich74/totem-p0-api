// utils/auditOwnerAction.js
/**
 * AUDIT GUARANTEE — OWNER ACTIONS
 *
 * RULE:
 * - MUST be called inside an existing DB transaction
 * - MUST throw on failure
 * - Any owner WRITE without audit = FORBIDDEN
 */

export async function auditOwnerAction({
  db,
  tx, // REQUIRED: transaction handle
  salon_slug,
  actor,
  action_type,
  entity_type,
  entity_id = null,
  request_id = null,
  metadata = null,
}) {
  if (!db) throw new Error("AUDIT_DB_REQUIRED");
  if (!tx) throw new Error("AUDIT_TX_REQUIRED");
  if (!actor?.user_id || !actor?.email) throw new Error("AUDIT_ACTOR_REQUIRED");
  if (!salon_slug) throw new Error("AUDIT_SALON_REQUIRED");
  if (!action_type) throw new Error("AUDIT_ACTION_REQUIRED");
  if (!entity_type) throw new Error("AUDIT_ENTITY_REQUIRED");

  try {
    tx.prepare(
      `
      INSERT INTO owner_actions_audit_log (
        salon_slug,
        actor_user_id,
        actor_email,
        action_type,
        entity_type,
        entity_id,
        request_id,
        metadata,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, now())
    `
    ).run(
      salon_slug,
      actor.user_id,
      actor.email,
      action_type,
      entity_type,
      entity_id,
      request_id,
      metadata ? JSON.stringify(metadata) : null
    );
  } catch (err) {
    throw new Error("OWNER_AUDIT_WRITE_FAILED");
  }
}
