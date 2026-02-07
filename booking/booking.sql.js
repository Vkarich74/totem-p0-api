import db from '../db.js';

export async function ensureBookingsTable() {
  if (db.mode === 'POSTGRES') {
    // 0) гарантируем, что таблица существует (минимальный каркас)
    await db.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY
      );
    `);

    // 1) обязательные колонки для текущего кода booking.service.js
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS salon_id INTEGER;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS master_id INTEGER;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status TEXT;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS request_id TEXT;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;`);

    // 2) дефолты (только если их нет — делаем мягко через UPDATE для NULL)
    await db.run(`UPDATE bookings SET status='reserved' WHERE status IS NULL;`);
    await db.run(`UPDATE bookings SET created_at=NOW() WHERE created_at IS NULL;`);

    // 3) уникальность request_id (без падений)
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
