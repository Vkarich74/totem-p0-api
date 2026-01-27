// index.js
import express from 'express'
import publicBooking from './routes/public_booking.js'

const app = express()
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

// ✅ PUBLIC BOOKING MOUNT
app.use('/booking', publicBooking)

const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
})
