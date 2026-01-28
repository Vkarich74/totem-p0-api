// routes/public_booking.js
import express from 'express'
import { getDB } from '../lib/db.js'

const router = express.Router()

router.post('/create', async (req, res) => {
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
    const salonRes = await db.query(
      'SELECT id FROM salons WHERE slug = $1',
      [salon_slug]
    )
    if (salonRes.rowCount === 0) {
      return res.status(400).json({ error: 'salon not found' })
    }

    // --- master ---
    const masterRes = await db.query(
      'SELECT id FROM masters WHERE slug = $1',
      [master_slug]
    )
    if (masterRes.rowCount === 0) {
      return res.status(400).json({ error: 'master not found' })
    }

    // --- service ---
    const serviceRes = await db.query(
      'SELECT id, duration_min FROM services WHERE service_id = $1',
      [service_id]
    )
    if (serviceRes.rowCount === 0) {
      return res.status(400).json({ error: 'service not found' })
    }

    const service = serviceRes.rows[0]

    // --- compute end_time ---
    const [h, m] = start_time.split(':').map(Number)
    const startMinutes = h * 60 + m
    const endMinutes = startMinutes + service.duration_min
    const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0')
    const endM = String(endMinutes % 60).padStart(2, '0')
    const end_time = `${endH}:${endM}`

    const insertRes = await db.query(
      `
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
      VALUES ($1,$2,$3,$4,$5,$6,'pending',$7)
      RETURNING id
      `,
      [
        salonRes.rows[0].id,
        masterRes.rows[0].id,
        service.id,
        date,
        start_time,
        end_time,
        source || null
      ]
    )

    return res.json({
      ok: true,
      booking_id: insertRes.rows[0].id,
      status: 'pending'
    })
  } catch (err) {
    console.error('PUBLIC /create error:', err)
    return res.status(500).json({ error: 'internal_error' })
  }
})

export default router
