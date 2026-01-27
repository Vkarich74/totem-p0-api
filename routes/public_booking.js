// routes/public_booking.js
import express from 'express'
import { getDB } from '../lib/db.js'

const router = express.Router()

// GET /booking/start (READ-ONLY DB)
router.get('/start', (req, res) => {
  try {
    const { salon_slug, master_slug, source } = req.query

    if (!salon_slug || !master_slug) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'salon_slug and master_slug are required'
      })
    }

    const db = getDB()
    const salon = db
      .prepare('SELECT slug, name FROM salons WHERE slug = ?')
      .get(salon_slug)

    if (!salon) {
      return res.status(404).json({ error: 'salon_not_found' })
    }

    return res.json({
      ok: true,
      salon,
      master_slug,
      source: source || null
    })
  } catch (err) {
    console.error('[PUBLIC_BOOKING_START]', err)
    return res.status(500).json({ error: 'internal_error' })
  }
})

// slots — пока без DB
router.get('/slots', (req, res) => {
  const { salon_slug, master_slug, date } = req.query
  if (!salon_slug || !master_slug || !date) {
    return res.status(400).json({ error: 'validation_error' })
  }
  return res.json({ ok: true, slots: [] })
})

// create — всё ещё smoke
router.post('/create', (req, res) => {
  const { salon_slug, master_slug, service_id } = req.body
  if (!salon_slug || !master_slug || !service_id) {
    return res.status(400).json({ error: 'validation_error' })
  }
  return res.json({ ok: true, booking_id: 'smoke-test' })
})

export default router
