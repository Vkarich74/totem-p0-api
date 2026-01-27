// routes/public_booking.js
import express from 'express'
import * as dbModule from '../lib/db.js'

const router = express.Router()

// универсально получаем db независимо от экспорта
const db =
  dbModule.db ||
  dbModule.default ||
  dbModule.connection ||
  dbModule

// GET /booking/start
router.get('/start', (req, res) => {
  try {
    const { salon_slug, master_slug, source } = req.query

    if (!salon_slug || !master_slug) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'salon_slug and master_slug are required'
      })
    }

    const salon = db
      .prepare('SELECT * FROM salons WHERE slug = ? AND enabled = 1')
      .get(salon_slug)

    if (!salon) {
      return res.status(404).json({ error: 'salon_not_found' })
    }

    return res.json({
      ok: true,
      salon_slug,
      master_slug,
      source: source || null
    })
  } catch (err) {
    console.error('[PUBLIC_BOOKING_START]', err)
    return res.status(500).json({ error: 'internal_error' })
  }
})

// GET /booking/slots
router.get('/slots', (req, res) => {
  try {
    const { salon_slug, master_slug, date } = req.query

    if (!salon_slug || !master_slug || !date) {
      return res.status(400).json({ error: 'validation_error' })
    }

    return res.json({
      ok: true,
      slots: []
    })
  } catch (err) {
    console.error('[PUBLIC_BOOKING_SLOTS]', err)
    return res.status(500).json({ error: 'internal_error' })
  }
})

// POST /booking/create
router.post('/create', (req, res) => {
  try {
    const {
      salon_slug,
      master_slug,
      service_id,
      date,
      start_time,
      source
    } = req.body

    if (!salon_slug || !master_slug || !service_id) {
      return res.status(400).json({ error: 'validation_error' })
    }

    const result = db
      .prepare(
        `INSERT INTO bookings
         (salon_slug, master_slug, service_id, date, start_time, source, status)
         VALUES (?, ?, ?, ?, ?, ?, 'created')`
      )
      .run(
        salon_slug,
        master_slug,
        service_id,
        date,
        start_time,
        source || null
      )

    return res.json({
      ok: true,
      booking_id: result.lastInsertRowid
    })
  } catch (err) {
    console.error('[PUBLIC_BOOKING_CREATE]', err)
    return res.status(500).json({ error: 'internal_error' })
  }
})

export default router
