import db from "../db.js";

async function safe(sql) {
  try {
    await db.run(sql);
  } catch (e) {
    // ignore (idempotent)
  }
}

async function main() {
  // salons
  await safe(`
    CREATE TABLE IF NOT EXISTS salons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE,
      name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ensure columns (SQLITE legacy)
  if (db.mode === "SQLITE") {
    await safe(`ALTER TABLE salons ADD COLUMN status TEXT DEFAULT 'active'`);
    await safe(`ALTER TABLE salons ADD COLUMN owner_user_id INTEGER`);
  }

  // masters
  await safe(`
    CREATE TABLE IF NOT EXISTS masters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT,
      phone TEXT,
      email TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  if (db.mode === "SQLITE") {
    await safe(`ALTER TABLE masters ADD COLUMN status TEXT DEFAULT 'active'`);
  }

  // master_salon
  await safe(`
    CREATE TABLE IF NOT EXISTS master_salon (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      salon_id INTEGER NOT NULL,
      master_id INTEGER NOT NULL,
      status TEXT DEFAULT 'invited',
      invited_at TEXT,
      activated_at TEXT,
      fired_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(salon_id, master_id)
    )
  `);

  // services
  await safe(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      salon_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      price_cents INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // bookings
  await safe(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      salon_id INTEGER NOT NULL,
      master_id INTEGER NOT NULL,
      service_id INTEGER,
      client_name TEXT,
      client_phone TEXT,
      client_email TEXT,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // financial_events — KGS
  await safe(`
    CREATE TABLE IF NOT EXISTS financial_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      salon_id INTEGER NOT NULL,
      master_id INTEGER,
      booking_id INTEGER,
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'KGS',
      confirmed_by TEXT NOT NULL,
      confirmed_at TEXT DEFAULT (datetime('now')),
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // seed salon 1
  await safe(`
    INSERT OR IGNORE INTO salons (id, slug, name, status)
    VALUES (1, 'salon-1', 'Salon 1', 'active')
  `);

  console.log("[OK] MULTI-SALON CORE APPLIED");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("MIGRATION ERROR:", e);
    process.exit(1);
  });
