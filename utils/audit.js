// utils/audit.js
// Audit helper — CANONICAL v1
// Safe: never throws to caller

import { pool } from "../db/index.js";

export async function writeBookingAudit({
  booking_id,
  from_status = null,
  to_status,
  actor_type,
  actor_id = null,
  source = null,
}) {
  try {
    await pool.query(
      `
      INSERT INTO booking_audit_log (
        booking_id,
        from_status,
        to_status,
        actor_type,
        actor_id,
        source,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `,
      [
        booking_id,
        from_status,
        to_status,
        actor_type,
        actor_id,
        source,
      ]
    );
  } catch (err) {
    // audit must never break flow
    console.error("audit write error:", err);
  }
}
