import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = "totem.db";
const MIGRATIONS_DIR = "./migrations";

const db = new Database(DB_PATH);

console.log("== MIGRATION START ==");
console.log("DB:", db.name);

// Таблица учёта миграций
db.exec(`
  CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT UNIQUE,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// ----------------------------------------------------
// LEGACY MIGRATION: booking_status already exists
// Мы НЕ выполняем SQL, только фиксируем как applied
// ----------------------------------------------------
const bookingMigration = "2026_01_25_add_booking_status.sql";

console.log(
  "FORCE SKIP",
  bookingMigration,
  "(legacy migration, columns already exist)"
);

db.prepare(
  "INSERT OR IGNORE INTO migrations (filename) VALUES (?)"
).run(bookingMigration);

console.log("== MIGRATION DONE ==");
