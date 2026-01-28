// index.js
import express from 'express'

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
app.get('/health', async (req, res) => {
  try {
    const db = getDB()
    await db.query('SELECT 1')
    res.json({ ok: true, db: 'postgres' })
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

  try {
    const db = getDB()

    // --- tables ---
    await db.query(`
      CREATE TABLE IF NOT EXISTS salons (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL
      );
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS masters (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL
      );
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        service_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        duration_min INTEGER NOT NULL,
        price INTEGER NOT NULL
      );
    `)

    await db.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        salon_id INTEGER REFERENCES salons(id),
        master_id INTEGER REFERENCES masters(id),
        service_id INTEGER REFERENCES services(id),
        date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        status TEXT NOT NULL,
        source TEXT
      );
    `)

    // --- seed ---
    await db.query(`
      INSERT INTO salons (slug, name)
      VALUES ('totem-demo-salon', 'Totem Demo Salon')
      ON CONFLICT DO NOTHING;
    `)

    await db.query(`
      INSERT INTO masters (slug, name)
      VALUES ('test-master', 'Test Master')
      ON CONFLICT DO NOTHING;
    `)

    await db.query(`
      INSERT INTO services (service_id, name, duration_min, price)
      VALUES ('srv1', 'Haircut', 60, 1000)
      ON CONFLICT DO NOTHING;
    `)

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
