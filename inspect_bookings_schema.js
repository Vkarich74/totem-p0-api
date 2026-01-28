import Database from "better-sqlite3";

const db = new Database("totem.db");

const columns = db
  .prepare(`PRAGMA table_info(bookings)`)
  .all();

console.log("BOOKINGS TABLE SCHEMA:");
columns.forEach(col => {
  console.log(`${col.name} (${col.type})`);
});

db.close();
