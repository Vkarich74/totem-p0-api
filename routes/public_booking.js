// routes/public_booking.js
import express from 'express'

const router = express.Router()

// --- helpers (NO DB) ---
function buildSlots(date, start = '09:00', end = '18:00', stepMin = 30) {
  const toMin = (t) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const toTime = (m) => {
    const h = String(Math.floor(m / 60)).padStart(2, '0')
    const mm = String(m % 60).padStart(2, '0')
    return `${h}:${mm}`
  }

  const s = toMin(start)
  const e = toMin(end)
  const slots = []
  for (let m = s; m + stepMin <= e; m += stepMin) {
    slots.push({
      start_time: toTime(m),
      end_time: toTime(m + stepMin),
      available: true
    })
  }
  return slots
}

// --- routes (SMOKE-SAFE) ---

router.get('/start', (req, res) => {
  const { salon_slug, master_slug, source } = req.query
  if (!salon_slug || !master_slug) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'salon_slug and master_slug are required'
    })
  }
  return res.json({ ok: true, salon_slug, master_slug, source: source || null })
})

router.get('/slots', (req, res) => {
  const { salon_slug, master_slug, date } = req.query
  if (!salon_slug || !master_slug || !date) {
    return res.status(400).json({ error: 'validation_error' })
  }

  const slots = buildSlots(date)
  return res.json({
    ok: true,
    date,
    step_min: 30,
    slots
  })
})

router.post('/create', (req, res) => {
  const { salon_slug, master_slug, service_id } = req.body
  if (!salon_slug || !master_slug || !service_id) {
    return res.status(400).json({ error: 'validation_error' })
  }
  return res.json({ ok: true, booking_id: 'smoke-test' })
})

export default router
