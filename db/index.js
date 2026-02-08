// db/index.js — unified DB access (Postgres / SQLite)
// GUARANTEE search_path for ALL connections

import pg from "pg";
import Database from "better-sqlite3";

const { Pool } = pg;

let pool = null;
let sqlite = null;

const DB_MODE = process.env.DB_MODE || (process.env.DATABASE_URL ? "POSTGRES" : "SQLITE");

if (DB_MODE === "POSTGRES") {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  // FORCE search_path for every connection
  pool.on("connect", async (client) => {
    await client.query("SET search_path TO totem_test, public");
  });

  console.log("[DB] MODE: POSTGRES");
} else {
  sqlite = new Database("totem.db");
  console.log("[DB] MODE: SQLITE");
}

export { pool };
export { sqlite };

export default { pool, sqlite };
