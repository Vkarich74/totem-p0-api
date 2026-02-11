import db from "../db.js";

export async function ensureAuthTables() {

  if (db.mode === "POSTGRES") {

    // Ensure base table exists
    await db.run(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE
      );
    `);

    // Add missing columns safely
    await db.run(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS password TEXT;`);
    await db.run(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS role TEXT;`);
    await db.run(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS master_id TEXT;`);
    await db.run(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS salon_id TEXT;`);
    await db.run(`ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`);

    await db.run(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);

    const row = await db.get(`SELECT COUNT(*)::int AS count FROM auth_users`);

    if (row && Number(row.count) === 0) {

      await db.run(
        `
        INSERT INTO auth_users (email, password, role, master_id, salon_id)
        VALUES
          ($1,$2,$3,$4,$5),
          ($6,$7,$8,$9,$10),
          ($11,$12,$13,$14,$15)
        `,
        [
          "master@test.com", "1234", "master", "m_test_1", null,
          "salon@test.com", "1234", "salon", null, "s_test_1",
          "owner@test.com", "1234", "owner", null, null
        ]
      );
    }

  } else {

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

  }
}
