// tools/inspect_salons.js
import { getDB } from '../lib/db.js'

const db = getDB()

console.log('== SALONS TABLE ==')
const rows = db.prepare(`SELECT id, slug, name FROM salons`).all()
console.table(rows)
