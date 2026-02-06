// db/index.js — unified DB access (Postgres / SQLite)
// Restores named export `pool` for legacy routes

import pg from "pg";
import Database from "better-sqlite3";

const { Pool } = pg;

let pool = null;
let sqlite = null;

// Detect mode
const DB_MODE = process.env.DB_MODE || (process.env.DATABASE_URL ? "POSTGRES" : "SQLITE");

if (DB_MODE === "POSTGRES") {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  });

  console.log("[DB] MODE: POSTGRES");
} else {
  sqlite = new Database("totem.db");
  console.log("[DB] MODE: SQLITE");
}

// --- exports ---

export { pool };          // 🔴 REQUIRED by routes_public/availability.js
export { sqlite };

export default {
  pool,
  sqlite,
};
