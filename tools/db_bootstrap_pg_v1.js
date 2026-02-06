/**
 * tools/db_bootstrap_pg_v1.js
 * ONE-TIME Postgres bootstrap (ESM)
 */

import { Client } from "pg";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function bootstrap() {
  console.log("== PG BOOTSTRAP START ==");

  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS salons (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS masters (
      id SERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      service_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      price INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      salon_slug TEXT NOT NULL,
      master_slug TEXT NOT NULL,
      service_id TEXT NOT NULL,
      date DATE NOT NULL,
      start_time TIME NOT NULL,
      status TEXT DEFAULT 'created',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER,
      amount INTEGER NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.end();

  console.log("== PG BOOTSTRAP DONE ==");
}

bootstrap().catch((err) => {
  console.error("❌ BOOTSTRAP ERROR:", err);
  process.exit(1);
});
