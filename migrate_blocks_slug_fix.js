import db from "./db.js";

// добавляем колонки, если нет
try {
  db.prepare(`ALTER TABLE blocks ADD COLUMN master_slug TEXT`).run();
} catch {}
try {
  db.prepare(`ALTER TABLE blocks ADD COLUMN salon_slug TEXT`).run();
} catch {}

// заполняем из текущих связей
const blocks = db.prepare(`SELECT id, master_id, salon_id FROM blocks`).all();

for (const b of blocks) {
  const master = db.prepare(`SELECT slug FROM masters WHERE id = ?`).get(b.master_id);
  const salon = db.prepare(`SELECT slug FROM salons WHERE id = ?`).get(b.salon_id);

  if (master && salon) {
    db.prepare(`
      UPDATE blocks
      SET master_slug = ?, salon_slug = ?
      WHERE id = ?
    `).run(master.slug, salon.slug, b.id);
  }
}

console.log("OK: blocks now have master_slug + salon_slug");
process.exit(0);
