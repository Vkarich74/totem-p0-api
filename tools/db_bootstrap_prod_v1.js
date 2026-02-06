// tools/db_seed_prod_v1.js
// PROD SEED (strict DB_PATH, no fallback)

import Database from 'better-sqlite3'

if (!process.env.DB_PATH) {
  console.error('❌ DB_PATH is required in PROD')
  process.exit(1)
}

const dbPath = process.env.DB_PATH
const db = new Database(dbPath)

console.log('PROD SEED DB PATH:', dbPath)
console.log('== PROD SEED START ==')

// salons
db.prepare(`
  INSERT OR IGNORE INTO salons (id, slug, name, active)
  VALUES (?, ?, ?, ?)
`).run('s1', 'totem-demo-salon', 'Totem Demo Salon', 1)

// legacy demo row (optional, safe)
db.prepare(`
  INSERT OR IGNORE INTO salons (id, slug, name, active)
  VALUES (?, ?, ?, ?)
`).run(null, 'demo-salon', 'Demo Salon', 1)

// masters
db.prepare(`
  INSERT OR IGNORE INTO masters (id, slug, name, active)
  VALUES (?, ?, ?, ?)
`).run('m1', 'test-master', 'Test Master', 1)

// services
db.prepare(`
  INSERT OR IGNORE INTO services (id, name, duration_min, price)
  VALUES (?, ?, ?, ?)
`).run('srv1', 'Haircut', 60, 1000)

console.log('== PROD SEED DONE ✅ ==')
