// lib/db.js
// Unified DB layer (Postgres in PROD, no SQLite fallback)

import pkg from 'pg'
const { Pool } = pkg

let pool = null

export function getDB() {
  if (pool) return pool

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production')
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })

  console.log('DB MODE: POSTGRES')

  return pool
}
