// index.js
import express from 'express'
import publicBooking from './routes/public_booking.js'

const app = express()
app.use(express.json())

// --- CORS (STEP 2: allow site embeds) ---
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Public-Token')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// --- PUBLIC TOKEN (READ-ONLY) ---
app.use((req, res, next) => {
  const token = req.header('X-Public-Token')
  // временно разрешаем пустой токен (для smoke)
  req.publicToken = token || null
  next()
})

// health
app.get('/health', (req, res) => {
  res.json({ ok: true })
})

// public booking
app.use('/booking', publicBooking)

const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
})
