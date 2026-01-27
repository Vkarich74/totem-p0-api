// tools/db_bootstrap_prod_v1.js
// PROD-SAFE DB BOOTSTRAP (idempotent)

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

const dbPath = process.env.DB_PATH || './totem.db'

// ensure dir exists
const dir = path.dirname(dbPath)
if (dir && dir !== '.' && !fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
}

const db = new Database(dbPath)

// WAL for safety
db.pragma('journal_mode = WAL')

console.log('BOOTSTRAP DB PATH:', dbPath)

db.exec(`
-- salons
CREATE TABLE IF NOT EXISTS salons (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  active INTEGER DEFAULT 1
);

-- masters
CREATE TABLE IF NOT EXISTS masters (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  active INTEGER DEFAULT 1
);

-- services
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  price INTEGER NOT NULL
);

-- bookings
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salon_id TEXT NOT NULL,
  master_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- payments
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_salon ON bookings(salon_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
`)

console.log('DB BOOTSTRAP DONE ✅')
