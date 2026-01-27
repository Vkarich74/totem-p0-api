// index.js — SAFE BOOT + PUBLIC BOOKING
import express from 'express'
import publicBooking from './routes/public_booking.js'

const app = express()
app.use(express.json())

// --------------------
// health — anchor
// --------------------
app.get('/health', (req, res) => {
  res.json({ ok: true })
})

// --------------------
// PUBLIC API v1
// --------------------
app.use('/public/booking', publicBooking)

// --------------------
// boot
// --------------------
const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log('BOOT OK on port', PORT)
})
