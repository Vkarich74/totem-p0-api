import db from '../db.js';

export async function ensureBookingsTable() {
  if (db.mode === 'POSTGRES') {
    // 1) base table
    await db.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        salon_id INTEGER NOT NULL,
        master_id INTEGER NOT NULL,
        start_at TIMESTAMPTZ NOT NULL,
        end_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'reserved',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2) request_id column (idempotency)
    await db.run(`
      ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS request_id TEXT;
    `);

    // 3) unique constraint (safe)
    await db.run(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'bookings_request_id_uidx'
        ) THEN
          CREATE UNIQUE INDEX bookings_request_id_uidx
          ON bookings (request_id)
          WHERE request_id IS NOT NULL;
        END IF;
      END$$;
    `);
  } else {
    // SQLITE
    await db.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        salon_id INTEGER NOT NULL,
        master_id INTEGER NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'reserved',
        request_id TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
}
