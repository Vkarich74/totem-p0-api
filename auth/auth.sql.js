import db from "../db.js";

export async function ensureAuthTables() {

  if (db.mode === "POSTGRES") {

    await db.run(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ
      );
    `);

  } else {

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
