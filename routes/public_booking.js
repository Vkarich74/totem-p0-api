// routes/public_booking.js
import express from 'express'
import { getDB } from '../lib/db.js'

const router = express.Router()

function validationError(res, message = 'validation_error') {
  return res.status(400).json({ error: 'validation_error', message })
}

// util: HH:MM + minutes
function addMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

// --------------------
// GET /public/booking/start
// --------------------
router.get('/start', (req, res) => {
  const { salon_slug, master_slug, source } = req.query
  if (!salon_slug || !master_slug) {
    return validationError(res, 'salon_slug and master_slug are required')
  }
  return res.json({ ok: true, salon_slug, master_slug, source: source || null })
})

// --------------------
// GET /public/booking/slots
// --------------------
router.get('/slots', (req, res) => {
  const { salon_slug, master_slug, date } = req.query
  if (!salon_slug || !master_slug || !date) return validationError(res)

  try {
    const db = getDB()
    const rows = db.prepare(`
      SELECT start_time, end_time, available
      FROM booking_slots
      WHERE salon_slug = ?
        AND master_slug = ?
        AND date = ?
      ORDER BY start_time
    `).all(salon_slug, master_slug, date)

    return res.json({ ok: true, date, slots: rows })
  } catch (e) {
    console.error('PUBLIC /slots error:', e)
    return res.status(500).json({ error: 'internal_error' })
  }
})

// --------------------
// POST /public/booking/create
// --------------------
router.post('/create', (req, res) => {
  const { salon_slug, master_slug, service_id, date, start_time, source } = req.body
  if (!salon_slug || !master_slug || !service_id || !date || !start_time) {
    return validationError(res)
  }

  try {
    const db = getDB()

    // salon_id
    const salon = db.prepare(`SELECT id FROM salons WHERE slug = ?`).get(salon_slug)
    if (!salon || !salon.id) return validationError(res, 'salon not found')

    // master_id
    const master = db.prepare(`SELECT id FROM masters WHERE slug = ?`).get(master_slug)
    if (!master) return validationError(res, 'master not found')

    // service duration
    const service = db.prepare(`
      SELECT duration_min FROM services WHERE id = ?
    `).get(service_id)

    if (!service) return validationError(res, 'service not found')

    const end_time = addMinutes(start_time, service.duration_min)

    // insert booking (CORE schema)
    const result = db.prepare(`
      INSERT INTO bookings (
        salon_id,
        master_id,
        service_id,
        date,
        start_time,
        end_time,
        source,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).run(
      salon.id,
      master.id,
      service_id,
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
  } catch (e) {
    console.error('PUBLIC /create error:', e)
    return res.status(500).json({ error: 'internal_error' })
  }
})

export default router
