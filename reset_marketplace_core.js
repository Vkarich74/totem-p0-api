import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve('./database.sqlite');

// ❌ удалить старую БД
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log('Old database removed');
}

// ✅ создать новую
const db = new Database(DB_PATH);
console.log('New database created');

// ===============================
// marketplace_salons
// ===============================
db.prepare(`
  CREATE TABLE marketplace_salons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`).run();

// ===============================
// services
// ===============================
db.prepare(`
  CREATE TABLE services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    salon_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    duration_min INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (salon_id) REFERENCES marketplace_salons(id)
  );
`).run();

// ===============================
// marketplace_bookings
// ===============================
db.prepare(`
  CREATE TABLE marketplace_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    salon_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,

    client_name TEXT,
    client_phone TEXT,

    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,

    -- P1.1 statuses (NEW)
    booking_status TEXT NOT NULL DEFAULT 'created',
    status_changed_at DATETIME,
    cancel_reason TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (salon_id) REFERENCES marketplace_salons(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
  );
`).run();

// ===============================
// INDEXES (P0 performance)
// ===============================
db.prepare(`
  CREATE INDEX idx_bookings_time
  ON marketplace_bookings (start_time, end_time);
`).run();

console.log('Database reset complete');
db.close();
