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

    // --- verify salon exists ---
    const salonCheck = await db.query(
      'SELECT 1 FROM salons WHERE slug = $1',
      [salon_slug]
    )
    if (salonCheck.rowCount === 0) {
      return res.status(400).json({ error: 'salon not found' })
    }

    // --- verify master exists ---
    const masterCheck = await db.query(
      'SELECT 1 FROM masters WHERE slug = $1',
      [master_slug]
    )
    if (masterCheck.rowCount === 0) {
      return res.status(400).json({ error: 'master not found' })
    }

    // --- service ---
    const serviceRes = await db.query(
      'SELECT duration_min FROM services WHERE service_id = $1',
      [service_id]
    )
    if (serviceRes.rowCount === 0) {
      return res.status(400).json({ error: 'service not found' })
    }

    const duration_min = serviceRes.rows[0].duration_min

    // --- compute end_time ---
    const [h, m] = start_time.split(':').map(Number)
    const startMinutes = h * 60 + m
    const endMinutes = startMinutes + duration_min
    const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0')
    const endM = String(endMinutes % 60).padStart(2, '0')
    const end_time = `${endH}:${endM}`

    // --- insert booking (SLUG-BASED, MATCHES DB) ---
    const insertRes = await db.query(
      `
      INSERT INTO bookings (
        salon_slug,
        master_slug,
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
        salon_slug,
        master_slug,
        service_id,
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
    console.error('PUBLIC /create ERROR:', err)
    return res.status(500).json({
      error: 'internal_error',
      detail: err.message
    })
  }
})

export default router
