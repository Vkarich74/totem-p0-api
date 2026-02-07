import db from '../db.js';

export async function ensureBookingsTable() {
  if (db.mode === 'POSTGRES') {
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
  } else {
    await db.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        salon_id INTEGER NOT NULL,
        master_id INTEGER NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'reserved',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
}
