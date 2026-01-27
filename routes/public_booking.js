// routes/public_booking.js
import express from 'express'

const router = express.Router()

// ❗ SMOKE-SAFE VERSION — NO DB, NO IMPORTS

router.get('/start', (req, res) => {
  const { salon_slug, master_slug, source } = req.query

  if (!salon_slug || !master_slug) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'salon_slug and master_slug are required'
    })
  }

  return res.json({
    ok: true,
    salon_slug,
    master_slug,
    source: source || null
  })
})

router.get('/slots', (req, res) => {
  const { salon_slug, master_slug, date } = req.query
  if (!salon_slug || !master_slug || !date) {
    return res.status(400).json({ error: 'validation_error' })
  }
  return res.json({ ok: true, slots: [] })
})

router.post('/create', (req, res) => {
  const { salon_slug, master_slug, service_id } = req.body
  if (!salon_slug || !master_slug || !service_id) {
    return res.status(400).json({ error: 'validation_error' })
  }
  return res.json({ ok: true, booking_id: 'smoke-test' })
})

export default router
