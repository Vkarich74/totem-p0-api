// index.js — SAFE BOOT + PUBLIC BOOKING (NO DB)
import express from 'express'
import publicBooking from './routes/public_booking.js'

const app = express()
app.use(express.json())

// health — якорь
app.get('/health', (req, res) => {
  res.json({ ok: true })
})

// PUBLIC BOOKING (SMOKE SAFE, NO DB)
app.use('/booking', publicBooking)

const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log('BOOT OK on port', PORT)
})
