import * as dbModule from "../db/index.js";

/**
 * Resolve DB handle from existing exports
 */
function resolveDb() {
  if (dbModule?.default) return dbModule.default;
  if (dbModule?.db) return dbModule.db;
  if (typeof dbModule?.getDb === "function") return dbModule.getDb();
  if (typeof dbModule?.get_db === "function") return dbModule.get_db();
  if (dbModule?.sqlite) return dbModule.sqlite;
  if (dbModule?.connection) return dbModule.connection;
  return null;
}

const db = resolveDb();

if (!db) {
  console.error("DB NOT RESOLVED");
  process.exit(1);
}

function printTableSchema(table) {
  console.log(`\n=== TABLE: ${table} ===`);
  const cols = db.prepare(`PRAGMA table_info(${table});`).all();
  console.table(cols);
}

function printSample(table) {
  console.log(`\n--- SAMPLE FROM ${table} ---`);
  const row = db.prepare(`SELECT * FROM ${table} LIMIT 1;`).get();
  console.log(row);
}

printTableSchema("bookings");
printTableSchema("payouts");

printSample("bookings");
printSample("payouts");
