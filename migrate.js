import Database from "better-sqlite3";

const db = new Database("totem.db");

console.log("== MIGRATION START ==");

db.prepare(`
  ALTER TABLE masters
  ADD COLUMN active INTEGER DEFAULT 1
`).run();

db.prepare(`
  ALTER TABLE salons
  ADD COLUMN active INTEGER DEFAULT 1
`).run();

console.log("== MIGRATION DONE ==");
