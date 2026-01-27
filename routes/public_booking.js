// routes/public_booking.js
import express from 'express'

const router = express.Router()

/**
 * STEP 1 — PUBLIC BOOKING SMOKE TEST
 * ❗ БЕЗ DB
 * ❗ БЕЗ marketplace
 * ❗ БЕЗ side-effects
 */

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

    return res.json({
      ok: true,
      booking_id: 'smoke-test'
    })
  } catch (err) {
    console.error('[PUBLIC_BOOKING_CREATE]', err)
    return res.status(500).json({ error: 'internal_error' })
  }
})

export default router
