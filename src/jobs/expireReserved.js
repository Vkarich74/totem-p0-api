import { pool } from "../db.js";

function intEnv(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

export async function expireReservedBookings() {
  const client = await pool.connect();

  // Production default: 5 minutes
  const ttlMinutes = intEnv("TTL_RESERVED_MINUTES", 5);

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
      UPDATE bookings
      SET status = 'cancelled',
          canceled_at = now(),
          cancel_reason = 'TTL_EXPIRED'
      WHERE status = 'reserved'
        AND created_at < now() - ($1::text || ' minutes')::interval
      RETURNING id
      `,
      [String(ttlMinutes)]
    );

    await client.query("COMMIT");

    if (result.rowCount > 0) {
      console.log(`[TTL] Expired ${result.rowCount} reserved bookings (ttl=${ttlMinutes}m)`);
    }
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    console.error("[TTL_ERROR]", err);
  } finally {
    client.release();
  }
}