// tools/db_bootstrap_payments_v1.js
import { getDB } from '../lib/db.js'

const db = getDB()

function tryExec(sql) {
  try {
    db.exec(sql)
    console.log('OK')
  } catch (e) {
    console.log('SKIP:', e.message)
  }
}

console.log('== PAYMENTS DB BOOTSTRAP v1 ==')

// если таблицы нет — создастся
tryExec(`
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`)

// если таблица СТАРАЯ — добавляем колонки
tryExec(`ALTER TABLE payments ADD COLUMN booking_id INTEGER;`)
tryExec(`ALTER TABLE payments ADD COLUMN amount INTEGER;`)
tryExec(`ALTER TABLE payments ADD COLUMN currency TEXT;`)
tryExec(`ALTER TABLE payments ADD COLUMN provider TEXT;`)
tryExec(`ALTER TABLE payments ADD COLUMN status TEXT;`)
tryExec(`ALTER TABLE payments ADD COLUMN created_at TEXT;`)

console.log('== DONE ==')
