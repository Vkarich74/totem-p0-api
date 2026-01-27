// index.js — PROD SAFE (NO dotenv)
import express from 'express'

import publicBooking from './routes/public_booking.js'
import publicPayment from './routes/public_payment.js'
import publicPaymentWebhook from './routes/public_payment_webhook.js'
import publicStatus from './routes/public_status.js'

const app = express()
app.use(express.json())

// health
app.get('/health', (req, res) => {
  res.json({ ok: true })
})

// public api
app.use('/public/booking', publicBooking)
app.use('/public/payment', publicPayment)
app.use('/public/payment', publicPaymentWebhook)
app.use('/public/status', publicStatus)

// boot
const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log('BOOT OK on port', PORT)
})
