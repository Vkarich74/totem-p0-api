import db from "../db.js";

export async function ensureAuthTables() {
  if (db.mode === "POSTGRES") {
    // Base table (safe)
    await db.run(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE
      );
    `);

    // Ensure required columns exist (safe migrations)
    await db.run(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS password TEXT;`);
    await db.run(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS role TEXT;`);
    await db.run(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS master_id TEXT;`);
    await db.run(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS salon_id TEXT;`);
    await db.run(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`);

    // Sessions table
    await db.run(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);

    // FORCE-SEED test users (idempotent)
    await db.run(
      `
      INSERT INTO auth_users (email, password, role, master_id, salon_id)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (email) DO NOTHING
      `,
      ["master@test.com", "1234", "master", "m_test_1", null]
    );

    await db.run(
      `
      INSERT INTO auth_users (email, password, role, master_id, salon_id)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (email) DO NOTHING
      `,
      ["salon@test.com", "1234", "salon", null, "s_test_1"]
    );

    await db.run(
      `
      INSERT INTO auth_users (email, password, role, master_id, salon_id)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (email) DO NOTHING
      `,
      ["owner@test.com", "1234", "owner", null, null]
    );
  } else {
    // SQLite fallback
    await db.run(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT,
        master_id TEXT,
        salon_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    await db.run(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );
    `);

    // FORCE-SEED (idempotent)
    await db.run(
      `INSERT OR IGNORE INTO auth_users (email, password, role, master_id, salon_id) VALUES (?,?,?,?,?)`,
      ["master@test.com", "1234", "master", "m_test_1", null]
    );
    await db.run(
      `INSERT OR IGNORE INTO auth_users (email, password, role, master_id, salon_id) VALUES (?,?,?,?,?)`,
      ["salon@test.com", "1234", "salon", null, "s_test_1"]
    );
    await db.run(
      `INSERT OR IGNORE INTO auth_users (email, password, role, master_id, salon_id) VALUES (?,?,?,?,?)`,
      ["owner@test.com", "1234", "owner", null, null]
    );
  }
}
