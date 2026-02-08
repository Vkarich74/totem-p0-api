import db from '../db.js';

const ALLOW_RESET =
  process.env.BOOKINGS_SCHEMA_RESET === '1';

export async function ensureBookingsTable() {
  if (db.mode === 'POSTGRES') {

    if (ALLOW_RESET) {
      console.warn('[BOOKINGS] SCHEMA RESET ENABLED');
      await db.run(`DROP TABLE IF EXISTS bookings`);
    }

    await db.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY
      );
    `);

    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS salon_id INTEGER;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS salon_slug TEXT;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS master_id INTEGER;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status TEXT;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS request_id TEXT;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS calendar_slot_id UUID;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;`);

    // defaults
    await db.run(`UPDATE bookings SET status='reserved' WHERE status IS NULL;`);
    await db.run(`UPDATE bookings SET created_at=NOW() WHERE created_at IS NULL;`);

    // FK (idempotent)
    await db.run(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'bookings_calendar_slot_fk'
        ) THEN
          ALTER TABLE bookings
          ADD CONSTRAINT bookings_calendar_slot_fk
          FOREIGN KEY (calendar_slot_id)
          REFERENCES calendar_slots(id)
          ON DELETE RESTRICT;
        END IF;
      END$$;
    `);

    // NOT NULL (SAFE)
    await db.run(`
      DO $$
      BEGIN
        ALTER TABLE bookings ALTER COLUMN salon_id SET NOT NULL;
        ALTER TABLE bookings ALTER COLUMN salon_slug SET NOT NULL;
        ALTER TABLE bookings ALTER COLUMN master_id SET NOT NULL;
        ALTER TABLE bookings ALTER COLUMN request_id SET NOT NULL;
        ALTER TABLE bookings ALTER COLUMN calendar_slot_id SET NOT NULL;
      END$$;
    `);

    // idempotency
    await db.run(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'bookings_request_id_uidx'
        ) THEN
          CREATE UNIQUE INDEX bookings_request_id_uidx
          ON bookings (request_id);
        END IF;
      END$$;
    `);

  } else {
    if (ALLOW_RESET) {
      await db.run(`DROP TABLE IF EXISTS bookings`);
    }

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
        calendar_slot_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
}
