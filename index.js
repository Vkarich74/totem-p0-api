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
app.get('/health', (req, res) => {
  try {
    getDB()
    res.json({ ok: true })
  } catch (e) {
    console.error('HEALTH error:', e)
    res.status(500).json({ ok: false })
  }
})

// ---------- PUBLIC API ----------
app.use('/public/booking', publicBooking)
app.use('/public/payment', publicPayment)
app.use('/public/payment', publicPaymentWebhook)

// ---------- START ----------
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`BOOT OK on port ${PORT}`)
})
