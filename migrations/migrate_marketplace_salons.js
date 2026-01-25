// migrations/migrate_marketplace_salons.js
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "totem.db");
const db = new Database(dbPath);

// ❗ пересоздаём таблицу корректно
db.exec(`
DROP TABLE IF EXISTS marketplace_salons;

CREATE TABLE marketplace_salons (
  salon_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  enabled_at TEXT
);
`);

console.log("OK: marketplace_salons recreated with TEXT salon_id");
db.close();
