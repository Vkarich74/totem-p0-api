import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import pg from "pg";

const { Pool } = pg;

function nowIso() {
  return new Date().toISOString();
}

function isPostgresMode() {
  const m = (process.env.DB_MODE || "").toLowerCase().trim();
  if (m === "postgres") return true;
  if (process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim()) return true;
  return false;
}

/* ================= POSTGRES ================= */

function makePg() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  async function query(text, params = []) {
    return pool.query(text, params);
  }

  async function oneOrNone(text, params = []) {
    const r = await pool.query(text, params);
    return r.rows.length ? r.rows[0] : null;
  }

  async function runInTx(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const tx = {
        query: (q, p = []) => client.query(q, p),
        oneOrNone: async (q, p = []) => {
          const r = await client.query(q, p);
          return r.rows.length ? r.rows[0] : null;
        }
      };
      const res = await fn(tx);
      await client.query("COMMIT");
      return res;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  return {
    mode: "postgres",
    query,
    oneOrNone,
    runInTx,
    nowIso
  };
}

/* ================= SQLITE ================= */

function resolveDbPath() {
  const envPath = process.env.DB_PATH && String(process.env.DB_PATH).trim();
  if (envPath) {
    return path.isAbsolute(envPath)
      ? envPath
      : path.resolve(process.cwd(), envPath);
  }

  const isProd =
    process.env.NODE_ENV === "production" ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_ENVIRONMENT_NAME;

  return isProd ? "/tmp/totem.db" : path.resolve(process.cwd(), "totem.db");
}

function makeSqlite() {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  return Object.assign(sqlite, {
    mode: "sqlite",
    nowIso,
    runInTx(fn) {
      return sqlite.transaction(fn)();
    }
  });
}

/* ================= EXPORT ================= */

const db = isPostgresMode() ? makePg() : makeSqlite();
export default db;
export { db, nowIso };
