// db.js — SINGLE SOURCE OF TRUTH
// PROD: Postgres (Railway)
// LOCAL: SQLite (totem.db)

import Database from "better-sqlite3";
import pg from "pg";
import fs from "fs";

const { Pool } = pg;

let db = null;

// Detect mode
const HAS_PG = Boolean(process.env.DATABASE_URL);

if (HAS_PG) {
  // =========================
  // POSTGRES MODE (PROD)
  // =========================
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === "disable"
      ? false
      : { rejectUnauthorized: false }
  });

  db = {
    mode: "POSTGRES",

    async get(sql, params = []) {
      const res = await pool.query(sql, params);
      return res.rows[0] || null;
    },

    async all(sql, params = []) {
      const res = await pool.query(sql, params);
      return res.rows;
    },

    async run(sql, params = []) {
      await pool.query(sql, params);
      return { ok: true };
    }
  };

  console.log("[DB] MODE: POSTGRES");

} else {
  // =========================
  // SQLITE MODE (LOCAL)
  // =========================
  const DB_FILENAME = "totem.db";

  if (!fs.existsSync(DB_FILENAME)) {
    console.error(`❌ REQUIRED DATABASE NOT FOUND: ${DB_FILENAME}`);
    process.exit(1);
  }

  const sqlite = new Database(DB_FILENAME);
  sqlite.pragma("journal_mode = WAL");

  db = {
    mode: "SQLITE",

    get(sql, params = []) {
      return sqlite.prepare(sql).get(params) || null;
    },

    all(sql, params = []) {
      return sqlite.prepare(sql).all(params);
    },

    run(sql, params = []) {
      sqlite.prepare(sql).run(params);
      return { ok: true };
    }
  };

  console.log("[DB] MODE: SQLITE");
}

export default db;
