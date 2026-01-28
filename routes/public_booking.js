// routes/public_booking.js
import express from 'express'
import { getDB } from '../lib/db.js'

const router = express.Router()

// POST /public/booking/create
router.post('/create', (req, res) => {
  try {
    const {
      salon_slug,
      master_slug,
      service_id,
      date,
      start_time,
      source
    } = req.body || {}

    if (!salon_slug || !master_slug || !service_id || !date || !start_time) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'missing required fields'
      })
    }

    const db = getDB()

    // --- salon ---
    const salon = db
      .prepare(`SELECT id FROM salons WHERE slug = ?`)
      .get(salon_slug)

    if (!salon) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'salon not found'
      })
    }

    // --- master ---
    const master = db
      .prepare(`SELECT id FROM masters WHERE slug = ?`)
      .get(master_slug)

    if (!master) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'master not found'
      })
    }

    // --- service ---
    const service = db
      .prepare(`SELECT id, duration_min FROM services WHERE id = ?`)
      .get(service_id)

    if (!service) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'service not found'
      })
    }

    // --- compute end_time ---
    const [h, m] = start_time.split(':').map(Number)
    const startMinutes = h * 60 + m
    const endMinutes = startMinutes + service.duration_min
    const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0')
    const endM = String(endMinutes % 60).padStart(2, '0')
    const end_time = `${endH}:${endM}`

    const result = db.prepare(`
      INSERT INTO bookings (
        salon_id,
        master_id,
        service_id,
        date,
        start_time,
        end_time,
        status,
        source
      )
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      salon.id,
      master.id,
      service.id,
      date,
      start_time,
      end_time,
      source || null
    )

    return res.json({
      ok: true,
      booking_id: result.lastInsertRowid,
      status: 'pending'
    })
  } catch (err) {
    console.error('PUBLIC /create error:', err)
    return res.status(500).json({ error: 'internal_error' })
  }
})

export default router
