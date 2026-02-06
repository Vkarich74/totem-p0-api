// tools/db_bootstrap_public_v1.js
import { getDB } from '../lib/db.js'

const db = getDB()

function tryExec(sql) {
  try {
    db.exec(sql)
    console.log('OK')
  } catch (e) {
    console.log('SKIP:', e.message)
  }
}

console.log('== PUBLIC DB BOOTSTRAP v1 ==')

// booking_slots
tryExec(`
CREATE TABLE IF NOT EXISTS booking_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salon_slug TEXT NOT NULL,
  master_slug TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  available INTEGER NOT NULL DEFAULT 1
);
`)

tryExec(`
CREATE INDEX IF NOT EXISTS idx_booking_slots_lookup
ON booking_slots (salon_slug, master_slug, date, start_time);
`)

// bookings — SAFE EXTEND
tryExec(`ALTER TABLE bookings ADD COLUMN salon_slug TEXT;`)
tryExec(`ALTER TABLE bookings ADD COLUMN master_slug TEXT;`)
tryExec(`ALTER TABLE bookings ADD COLUMN service_id TEXT;`)
tryExec(`ALTER TABLE bookings ADD COLUMN source TEXT;`)
tryExec(`ALTER TABLE bookings ADD COLUMN status TEXT DEFAULT 'pending';`)
tryExec(`ALTER TABLE bookings ADD COLUMN created_at TEXT;`)

console.log('== DONE ==')
