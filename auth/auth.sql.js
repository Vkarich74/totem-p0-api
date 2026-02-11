import db from "../db.js";

export async function ensureAuthTables() {
  if (db.mode === "POSTGRES") {
    await db.run(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        master_id TEXT,
        salon_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await db.run(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT auth_sessions_user_fk
          FOREIGN KEY (user_id) REFERENCES auth_users(id)
          ON DELETE CASCADE
      );
    `);

    // Seed if empty
    const row = await db.get(`SELECT COUNT(*)::int AS count FROM auth_users`);
    if (row && Number(row.count) === 0) {
      await db.run(
        `
        INSERT INTO auth_users (id, email, password, role, master_id, salon_id)
        VALUES
          ($1,$2,$3,$4,$5,$6),
          ($7,$8,$9,$10,$11,$12),
          ($13,$14,$15,$16,$17,$18)
        ON CONFLICT (email) DO NOTHING
        `,
        [
          "u_master_1", "master@test.com", "1234", "master", "m_test_1", null,
          "u_salon_1",  "salon@test.com",  "1234", "salon",  null,        "s_test_1",
          "u_owner_1",  "owner@test.com",  "1234", "owner",  null,        null
        ]
      );
    }
  } else {
    await db.run(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        master_id TEXT,
        salon_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    await db.run(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );
    `);

    const row = await db.get(`SELECT COUNT(*) AS count FROM auth_users`);
    if (row && Number(row.count) === 0) {
      await db.run(
        `INSERT OR IGNORE INTO auth_users (id, email, password, role, master_id, salon_id) VALUES (?,?,?,?,?,?)`,
        ["u_master_1", "master@test.com", "1234", "master", "m_test_1", null]
      );
      await db.run(
        `INSERT OR IGNORE INTO auth_users (id, email, password, role, master_id, salon_id) VALUES (?,?,?,?,?,?)`,
        ["u_salon_1", "salon@test.com", "1234", "salon", null, "s_test_1"]
      );
      await db.run(
        `INSERT OR IGNORE INTO auth_users (id, email, password, role, master_id, salon_id) VALUES (?,?,?,?,?,?)`,
        ["u_owner_1", "owner@test.com", "1234", "owner", null, null]
      );
    }
  }
}
