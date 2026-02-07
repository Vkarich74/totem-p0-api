import db from '../db.js';

export async function ensureCalendarTable() {
  if (db.mode === 'POSTGRES') {
    await db.run(`
      CREATE TABLE IF NOT EXISTS calendar_slots (
        id SERIAL PRIMARY KEY,
        master_id INTEGER NOT NULL,
        salon_id INTEGER NOT NULL,
        start_at TIMESTAMPTZ NOT NULL,
        end_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'reserved',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await db.run(`
      ALTER TABLE calendar_slots
      ADD COLUMN IF NOT EXISTS request_id TEXT;
    `);

    await db.run(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'calendar_request_id_uidx'
        ) THEN
          CREATE UNIQUE INDEX calendar_request_id_uidx
          ON calendar_slots (request_id)
          WHERE request_id IS NOT NULL;
        END IF;
      END$$;
    `);
  } else {
    await db.run(`
      CREATE TABLE IF NOT EXISTS calendar_slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        master_id INTEGER NOT NULL,
        salon_id INTEGER NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'reserved',
        request_id TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
}
