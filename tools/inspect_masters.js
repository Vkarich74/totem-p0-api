// tools/inspect_masters.js
import { getDB } from '../lib/db.js'

const db = getDB()

console.log('== MASTERS TABLE ==')
try {
  const rows = db.prepare(`
    SELECT id, slug, name FROM masters
  `).all()
  console.table(rows)
} catch (e) {
  console.error('ERROR:', e.message)
}
