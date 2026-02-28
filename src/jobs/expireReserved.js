import { pool } from "../db.js";

export async function expireReservedBookings() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(`
      UPDATE bookings
      SET status = 'cancelled',
          canceled_at = now(),
          cancel_reason = 'TTL_EXPIRED'
      WHERE status = 'reserved'
        AND created_at < now() - interval '1 minute'
      RETURNING id
    `);

    await client.query("COMMIT");

    if (result.rowCount > 0) {
      console.log(`[TTL] Expired ${result.rowCount} reserved bookings`);
    }

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[TTL_ERROR]", err);
  } finally {
    client.release();
  }
}