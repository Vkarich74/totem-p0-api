import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * DB PATH
 * - Local: ./totem.db
 * - Railway / Prod: /tmp/totem.db
 */
const DEFAULT_DB_PATH =
  process.env.DB_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/tmp/totem.db"
    : path.resolve("./totem.db"));

const dir = path.dirname(DEFAULT_DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(DEFAULT_DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/**
 * Helpers (если уже были — сохраняем контракт)
 */
export function nowIso() {
  return new Date().toISOString();
}

export function runInTx(fn) {
  const tx = db.transaction(fn);
  return tx();
}
