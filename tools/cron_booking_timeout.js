/**
 * CRON: Booking payment timeout
 *
 * Locking:
 * - Uses pg advisory lock to prevent parallel runs
 *
 * Usage:
 *   node tools/cron_booking_timeout.js
 *   node tools/cron_booking_timeout.js --confirm=1
 */

import pool from '../db/index.js';

const TIMEOUT_MINUTES = 15;
const CONFIRM = process.argv.includes('--confirm=1');
const LOCK_KEY = 424242; // constant advisory lock key

async function run() {
  const client = await pool.connect();
  try {
    // acquire lock
    const lockRes = await client.query(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [LOCK_KEY]
    );

    if (!lockRes.rows[0].locked) {
      console.log('[LOCK] another instance is running, exit');
      return;
    }

    await client.query('BEGIN');

    const scanSql = `
      SELECT id
      FROM bookings
      WHERE status = 'pending_payment'
        AND created_at < NOW() - INTERVAL '${TIMEOUT_MINUTES} minutes'
      FOR UPDATE
    `;

    const { rows } = await client.query(scanSql);
    console.log(`[SCAN] found ${rows.length} expired candidates`);

    if (!CONFIRM) {
      console.log('[DRY RUN] no updates applied');
      await client.query('ROLLBACK');
      return;
    }

    if (rows.length === 0) {
      console.log('[CONFIRM] nothing to update');
      await client.query('COMMIT');
      return;
    }

    const ids = rows.map(r => r.id);

    const updateSql = `
      UPDATE bookings
      SET status = 'expired'
      WHERE id = ANY($1)
        AND status = 'pending_payment'
    `;

    const res = await client.query(updateSql, [ids]);
    console.log(`[CONFIRM] expired bookings: ${res.rowCount}`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ERROR]', err);
    process.exitCode = 1;
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    } catch {}
    client.release();
    await pool.end();
  }
}

run();
