// db/index.js
import pg from "pg";

const { Pool } = pg;

let pool;

/**
 * Lazy init DB pool
 */
export function openDb() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
    });
  }
  return pool;
}
