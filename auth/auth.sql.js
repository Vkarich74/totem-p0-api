import db from "../db.js";

export async function ensureAuthTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      master_id TEXT,
      salon_id TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  const row = db.prepare("SELECT COUNT(*) AS count FROM users").get();

  if (row && row.count === 0) {
    const insert = db.prepare(`
      INSERT INTO users (id, email, password, role, master_id, salon_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insert.run("u_master_1", "master@test.com", "1234", "master", "m_test_1", null);
    insert.run("u_salon_1", "salon@test.com", "1234", "salon", null, "s_test_1");
    insert.run("u_owner_1", "owner@test.com", "1234", "owner", null, null);
  }
}
