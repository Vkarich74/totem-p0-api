// scheduler.js
/**
 * PROD SCHEDULER — SAFE MODE
 *
 * - Single-run guarded by system_locks
 * - TTL-based lock to avoid deadlocks
 * - Silent exit if lock is held
 */

import pool from './db/index.js';
import os from 'os';
import { runQueueWorker } from './jobs/queueWorker.js';

const LOCK_KEY = 'async_worker';
const LOCK_TTL_SECONDS = 120;

async function acquireLock(client) {
  const lockedBy = `${os.hostname()}:${process.pid}`;

  const { rowCount } = await client.query(
    `
    INSERT INTO system_locks (lock_key, locked_by, expires_at)
    VALUES ($1, $2, now() + ($3 || ' seconds')::interval)
    ON CONFLICT (lock_key) DO UPDATE
    SET locked_by = EXCLUDED.locked_by,
        locked_at = now(),
        expires_at = EXCLUDED.expires_at,
        updated_at = now()
    WHERE system_locks.expires_at < now()
    `,
    [LOCK_KEY, lockedBy, LOCK_TTL_SECONDS]
  );

  return rowCount === 1;
}

async function releaseLock(client) {
  await client.query(
    `DELETE FROM system_locks WHERE lock_key = $1`,
    [LOCK_KEY]
  );
}

export async function runSchedulerOnce() {
  let client;
  try {
    client = await pool.connect();

    const acquired = await acquireLock(client);
    if (!acquired) {
      // another instance is running
      return;
    }

    await runQueueWorker();
  } catch (err) {
    console.error('[SCHEDULER_ERROR]', err);
  } finally {
    try {
      if (client) await releaseLock(client);
    } catch (_) {}
    if (client) client.release();
  }
}

// Auto-run only in prod
if (process.env.NODE_ENV === 'production') {
  runSchedulerOnce()
    .then(() => {
      // no-op
    })
    .catch((err) => {
      console.error('[SCHEDULER_FATAL]', err);
    });
}
