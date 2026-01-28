import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// =======================================
// 🔒 SINGLE SOURCE OF TRUTH — ONLY totem.db
// =======================================
const DB_FILENAME = "totem.db";
const DB_PATH = path.resolve(DB_FILENAME);

// ---------------------------------------
// ❌ FORBIDDEN DATABASE FILES
// ---------------------------------------
const FORBIDDEN = [
  "data.db",
  "data.sqlite",
  "database.sqlite",
  "db.sqlite"
];

// ---------------------------------------
// 🧨 FAIL FAST: forbidden db exists
// ---------------------------------------
for (const name of FORBIDDEN) {
  const p = path.resolve(name);
  if (fs.existsSync(p)) {
    console.error("❌ FORBIDDEN DATABASE FILE DETECTED:", name);
    console.error("Remove it from project root.");
    process.exit(1);
  }
}

// ---------------------------------------
// 🧨 FAIL FAST: required db missing
// ---------------------------------------
if (!fs.existsSync(DB_PATH)) {
  console.error("❌ REQUIRED DATABASE NOT FOUND:", DB_FILENAME);
  process.exit(1);
}

// ---------------------------------------
// ✅ OPEN DATABASE
// ---------------------------------------
const db = new Database(DB_PATH);

// ---------------------------------------
// 📢 EXPLICIT LOG
// ---------------------------------------
console.log("USING DATABASE:", DB_PATH);

export default db;
