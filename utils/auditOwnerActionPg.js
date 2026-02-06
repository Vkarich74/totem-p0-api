// utils/auditOwnerActionPg.js
/**
 * OWNER ACTION AUDIT (POSTGRES) — SAFE MODE
 *
 * CONTRACT:
 * - BEST EFFORT (never blocks main flow)
 * - NEVER throws
 * - NEVER required for prod stability
 * - ENABLED ONLY via AUDIT_ENABLED=true
 *
 * SCOPE:
 * - Owner / Ops actions only
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
  try {
    if (process.env.AUDIT_ENABLED !== 'true') return;
    if (!client) return;

    if (!actor?.id || !actor?.email) return;
    if (!salon_slug || !action_type || !entity_type) return;

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
  } catch (err) {
    console.error('[AUDIT_OWNER_ACTION_FAILED]', {
      message: err?.message,
      action_type,
      entity_type,
      entity_id,
      request_id
    });
  }
}
