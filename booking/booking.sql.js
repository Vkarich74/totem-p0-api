import db from '../db.js';

const ALLOW_RESET =
  process.env.BOOKINGS_SCHEMA_RESET === '1';

export async function ensureBookingsTable() {
  if (db.mode === 'POSTGRES') {

    // ⚠️ HARD RESET — DEV ONLY (explicit flag)
    if (ALLOW_RESET) {
      console.warn('[BOOKINGS] SCHEMA RESET ENABLED');
      await db.run(`DROP TABLE IF EXISTS bookings`);
    }

    // Base table (never destructive)
    await db.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY
      );
    `);

    // Canonical columns (idempotent)
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS salon_id INTEGER;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS salon_slug TEXT;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS master_id INTEGER;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status TEXT;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS request_id TEXT;`);
    await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;`);

    // Defaults for legacy rows
    await db.run(`UPDATE bookings SET status='reserved' WHERE status IS NULL;`);
    await db.run(`UPDATE bookings SET created_at=NOW() WHERE created_at IS NULL;`);

    // NOT NULL guarantees (safe: after defaults)
    await db.run(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='bookings' AND column_name='salon_id'
        ) THEN
          ALTER TABLE bookings ALTER COLUMN salon_id SET NOT NULL;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='bookings' AND column_name='salon_slug'
        ) THEN
          ALTER TABLE bookings ALTER COLUMN salon_slug SET NOT NULL;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='bookings' AND column_name='master_id'
        ) THEN
          ALTER TABLE bookings ALTER COLUMN master_id SET NOT NULL;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='bookings' AND column_name='request_id'
        ) THEN
          ALTER TABLE bookings ALTER COLUMN request_id SET NOT NULL;
        END IF;
      END$$;
    `);

    // Unique index for idempotency
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
    // SQLITE (local/dev)
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
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
}
