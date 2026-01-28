// index.js
import express from 'express'
import cors from 'cors'

// DB (runtime)
import { getDB } from './lib/db.js'

// Public routes
import publicBooking from './routes/public_booking.js'
import publicPayment from './routes/public_payment.js'
import publicPaymentWebhook from './routes/public_payment_webhook.js'

const app = express()

// -------- MIDDLEWARE --------
app.use(cors())
app.use(express.json())

// -------- HEALTH --------
app.get('/health', (req, res) => {
  try {
    // touch DB to ensure runtime uses correct DB_PATH
    getDB()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false })
  }
})

// -------- PUBLIC API --------
app.use('/public/booking', publicBooking)
app.use('/public/payment', publicPayment)
app.use('/public/payment', publicPaymentWebhook)

// -------- START --------
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`BOOT OK on port ${PORT}`)
})
