import db from "../db.js";

async function run() {
  console.log("APPLY master_salon FIX");

  // drop duplicate
  await db.run(`DROP TABLE IF EXISTS salon_masters`);

  // rebuild
  await db.run(`
    CREATE TABLE IF NOT EXISTS master_salon_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      salon_id TEXT NOT NULL,
      master_id TEXT NOT NULL,
      status TEXT DEFAULT 'invited',
      invited_at TEXT,
      activated_at TEXT,
      fired_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (salon_id, master_id)
    )
  `);

  await db.run(`
    INSERT INTO master_salon_new (
      id, salon_id, master_id, status,
      invited_at, activated_at, fired_at,
      created_at, updated_at
    )
    SELECT
      id,
      CAST(salon_id AS TEXT),
      CAST(master_id AS TEXT),
      status,
      invited_at, activated_at, fired_at,
      created_at, updated_at
    FROM master_salon
  `);

  await db.run(`DROP TABLE master_salon`);
  await db.run(`ALTER TABLE master_salon_new RENAME TO master_salon`);

  await db.run(`CREATE INDEX IF NOT EXISTS idx_master_salon_salon ON master_salon (salon_id)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_master_salon_master ON master_salon (master_id)`);

  console.log("DONE");
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
