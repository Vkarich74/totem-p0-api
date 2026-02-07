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
  } else {
    await db.run(`
      CREATE TABLE IF NOT EXISTS calendar_slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        master_id INTEGER NOT NULL,
        salon_id INTEGER NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'reserved',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
}
