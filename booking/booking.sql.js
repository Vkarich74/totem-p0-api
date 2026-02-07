import db from '../db.js';

export async function ensureBookingsTable() {
  if (db.mode === 'POSTGRES') {
    // ⚠️ HARD RESET — bookings is NOT user data yet
    await db.run(`DROP TABLE IF EXISTS bookings`);

    await db.run(`
      CREATE TABLE bookings (
        id SERIAL PRIMARY KEY,

        salon_id INTEGER NOT NULL,
        salon_slug TEXT NOT NULL,

        master_id INTEGER NOT NULL,

        start_at TIMESTAMPTZ NOT NULL,
        end_at TIMESTAMPTZ NOT NULL,

        status TEXT NOT NULL DEFAULT 'reserved',
        request_id TEXT NOT NULL UNIQUE,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } else {
    // SQLITE (local)
    await db.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        salon_id INTEGER NOT NULL,
        salon_slug TEXT NOT NULL,
        master_id INTEGER NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'reserved',
        request_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
}
