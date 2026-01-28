// index.js
import express from 'express'
import { Client } from 'pg'

// DB runtime
import { getDB } from './lib/db.js'

// Public routes
import publicBooking from './routes/public_booking.js'
import publicPayment from './routes/public_payment.js'
import publicPaymentWebhook from './routes/public_payment_webhook.js'

const app = express()

// ---------- MIDDLEWARE ----------
app.use(express.json())

// ---------- HEALTH ----------
app.get('/health', (req, res) => {
  try {
    getDB()
    res.json({ ok: true })
  } catch (e) {
    console.error('HEALTH error:', e)
    res.status(500).json({ ok: false })
  }
})

// ---------- TEMP PG BOOTSTRAP (REMOVE AFTER RUN) ----------
app.post('/internal/bootstrap', async (req, res) => {
  if (req.headers['x-bootstrap-secret'] !== process.env.PUBLIC_TOKEN) {
    return res.status(403).json({ error: 'forbidden' })
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL not set' })
  }

  try {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })

    await client.connect()

    await client.query(`
      CREATE TABLE IF NOT EXISTS salons (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS masters (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        service_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        duration_min INTEGER NOT NULL,
        price INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)

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
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER,
        amount INTEGER NOT NULL,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)

    await client.query(`
      INSERT INTO salons (slug, name)
      VALUES ('totem-demo-salon', 'Totem Demo Salon')
      ON CONFLICT DO NOTHING;
    `)

    await client.query(`
      INSERT INTO masters (slug, name)
      VALUES ('test-master', 'Test Master')
      ON CONFLICT DO NOTHING;
    `)

    await client.query(`
      INSERT INTO services (service_id, name, duration_min, price)
      VALUES ('srv1', 'Haircut', 60, 1000)
      ON CONFLICT DO NOTHING;
    `)

    await client.end()

    res.json({ ok: true })
  } catch (e) {
    console.error('BOOTSTRAP ERROR:', e)
    res.status(500).json({ error: 'bootstrap_failed' })
  }
})
// ---------- END TEMP PG BOOTSTRAP ----------

// ---------- PUBLIC API ----------
app.use('/public/booking', publicBooking)
app.use('/public/payment', publicPayment)
app.use('/public/payment', publicPaymentWebhook)

// ---------- START ----------
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`BOOT OK on port ${PORT}`)
})
