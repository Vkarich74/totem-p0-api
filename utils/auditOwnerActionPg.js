// utils/auditOwnerActionPg.js
/**
 * AUDIT GUARANTEE — OWNER ACTIONS (POSTGRES)
 *
 * RULE:
 * - MUST be called inside an existing PG transaction
 * - MUST throw on failure
 * - Any owner WRITE without audit = FORBIDDEN
 */

export async function auditOwnerActionPg(client, {
  salon_slug,
  actor, // { id, email }
  action_type,
  entity_type,
  entity_id = null,
  request_id = null,
  metadata = null,
}) {
  if (!client) throw new Error('AUDIT_PG_CLIENT_REQUIRED');
  if (!actor?.id || !actor?.email) throw new Error('AUDIT_ACTOR_REQUIRED');
  if (!salon_slug) throw new Error('AUDIT_SALON_REQUIRED');
  if (!action_type) throw new Error('AUDIT_ACTION_REQUIRED');
  if (!entity_type) throw new Error('AUDIT_ENTITY_REQUIRED');

  await client.query(
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
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
    `,
    [
      salon_slug,
      actor.id,
      actor.email,
      action_type,
      entity_type,
      entity_id,
      request_id,
      metadata
    ]
  );
}
