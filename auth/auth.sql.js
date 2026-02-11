import db from "../db.js";

export async function ensureAuthTables() {

  if (db.mode === "POSTGRES") {

    await db.run(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id SERIAL PRIMARY KEY,
        email TEXT,
        password TEXT,
        role TEXT,
        master_id TEXT,
        salon_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await db.run(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ
      );
    `);

    // Insert test master if not exists
    const master = await db.get(
      `SELECT id FROM auth_users WHERE email=$1 LIMIT 1`,
      ["master@test.com"]
    );

    if (!master) {
      await db.run(
        `
        INSERT INTO auth_users (email, password, role, master_id, salon_id)
        VALUES ($1,$2,$3,$4,$5)
        `,
        ["master@test.com", "1234", "master", "m_test_1", null]
      );
    }

    const salon = await db.get(
      `SELECT id FROM auth_users WHERE email=$1 LIMIT 1`,
      ["salon@test.com"]
    );

    if (!salon) {
      await db.run(
        `
        INSERT INTO auth_users (email, password, role, master_id, salon_id)
        VALUES ($1,$2,$3,$4,$5)
        `,
        ["salon@test.com", "1234", "salon", null, "s_test_1"]
      );
    }

    const owner = await db.get(
      `SELECT id FROM auth_users WHERE email=$1 LIMIT 1`,
      ["owner@test.com"]
    );

    if (!owner) {
      await db.run(
        `
        INSERT INTO auth_users (email, password, role, master_id, salon_id)
        VALUES ($1,$2,$3,$4,$5)
        `,
        ["owner@test.com", "1234", "owner", null, null]
      );
    }

  } else {

    await db.run(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
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
        user_id INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT
      );
    `);

  }
}
