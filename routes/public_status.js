// routes/public_status.js
import express from 'express'
import { getDB } from '../lib/db.js'
import { requirePublicToken } from '../middleware/anti_bypass_public.js'

const router = express.Router()

function validationError(res, message = 'validation_error') {
  return res.status(400).json({ error: 'validation_error', message })
}

// --------------------
// GET /public/status/booking
// --------------------
router.get('/booking', requirePublicToken, (req, res) => {
  const { booking_id } = req.query
  if (!booking_id) return validationError(res, 'booking_id required')

  try {
    const db = getDB()
    const row = db.prepare(`
      SELECT
        b.id AS booking_id,
        b.status,
        b.date,
        b.start_time,
        b.end_time,
        b.source,
        b.created_at,
        s.slug AS salon_slug,
        m.slug AS master_slug,
        b.service_id
      FROM bookings b
      JOIN salons s ON s.id = b.salon_id
      JOIN masters m ON m.id = b.master_id
      WHERE b.id = ?
    `).get(booking_id)

    if (!row) return validationError(res, 'booking not found')

    return res.json({ ok: true, booking: row })
  } catch (e) {
    console.error('STATUS /booking error:', e)
    return res.status(500).json({ error: 'internal_error' })
  }
})

// --------------------
// GET /public/status/payment
// --------------------
router.get('/payment', requirePublicToken, (req, res) => {
  const { payment_id } = req.query
  if (!payment_id) return validationError(res, 'payment_id required')

  try {
    const db = getDB()
    const row = db.prepare(`
      SELECT
        p.id AS payment_id,
        p.booking_id,
        p.amount,
        p.currency,
        p.provider,
        p.status,
        p.created_at
      FROM payments p
      WHERE p.id = ?
    `).get(payment_id)

    if (!row) return validationError(res, 'payment not found')

    return res.json({ ok: true, payment: row })
  } catch (e) {
    console.error('STATUS /payment error:', e)
    return res.status(500).json({ error: 'internal_error' })
  }
})

export default router
