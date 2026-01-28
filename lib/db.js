// lib/db.js
// Single source of truth for DB connection (PROD-safe)

import Database from 'better-sqlite3'

let dbInstance = null

export function getDB() {
  if (dbInstance) return dbInstance

  const dbPath = process.env.DB_PATH
  if (!dbPath) {
    throw new Error('DB_PATH is required (no fallback allowed)')
  }

  console.log('APP DB PATH:', dbPath)

  dbInstance = new Database(dbPath)
  dbInstance.pragma('journal_mode = WAL')

  return dbInstance
}
