// tools/db_seed_prod_v1.js
import { getDB } from '../lib/db.js'

const db = getDB()

console.log('== PROD SEED START ==')

// ---- SALON ----
db.prepare(`
  INSERT OR IGNORE INTO salons (id, slug, name, active)
  VALUES ('s1', 'totem-demo-salon', 'Totem Demo Salon', 1)
`).run()

// ---- MASTER ----
db.prepare(`
  INSERT OR IGNORE INTO masters (id, slug, name, active)
  VALUES ('m1', 'test-master', 'Test Master', 1)
`).run()

// ---- SERVICE ----
db.prepare(`
  INSERT OR IGNORE INTO services (id, name, duration_min, price)
  VALUES ('srv1', 'Haircut', 60, 1000)
`).run()

console.log('== PROD SEED DONE ✅ ==')
