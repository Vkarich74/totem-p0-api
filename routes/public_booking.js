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

    // Проверки существования (мягкие, без id)
    const salonOk = await db.query(
      'SELECT 1 FROM salons WHERE slug = $1',
      [salon_slug]
    )
    if (salonOk.rowCount === 0) {
      return res.status(400).json({ error: 'salon not found' })
    }

    const masterOk = await db.query(
      'SELECT 1 FROM masters WHERE slug = $1',
      [master_slug]
    )
    if (masterOk.rowCount === 0) {
      return res.status(400).json({ error: 'master not found' })
    }

    const serviceOk = await db.query(
      'SELECT 1 FROM services WHERE service_id = $1',
      [service_id]
    )
    if (serviceOk.rowCount === 0) {
      return res.status(400).json({ error: 'service not found' })
    }

    // ВСТАВЛЯЕМ ТОЛЬКО СУЩЕСТВУЮЩИЕ КОЛОНКИ
    const insertRes = await db.query(
      `
      INSERT INTO bookings (
        salon_slug,
        master_slug,
        service_id,
        date,
        start_time,
        status,
        source
      )
      VALUES ($1,$2,$3,$4,$5,'pending',$6)
      RETURNING id
      `,
      [
        salon_slug,
        master_slug,
        service_id,
        date,
        start_time,
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
