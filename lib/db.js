// lib/db.js
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let dbInstance = null

export function getDB() {
  if (dbInstance) return dbInstance

  const dbPath = path.join(__dirname, '..', 'totem.db')
  dbInstance = new Database(dbPath)

  dbInstance.pragma('journal_mode = WAL')

  return dbInstance
}
