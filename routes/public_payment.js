// routes/public_payment.js
import express from 'express'
import { getDB } from '../lib/db.js'

const router = express.Router()

function validationError(res, message = 'validation_error') {
  return res.status(400).json({ error: 'validation_error', message })
}

// POST /public/payment/intent
router.post('/intent', (req, res) => {
  const { booking_id, amount, currency, provider } = req.body

  if (!booking_id || !amount || !currency || !provider) {
    return validationError(res)
  }

  try {
    const db = getDB()

    // booking must exist
    const booking = db.prepare(`
      SELECT id FROM bookings WHERE id = ?
    `).get(booking_id)

    if (!booking) {
      return validationError(res, 'booking not found')
    }

    const result = db.prepare(`
      INSERT INTO payments (
        booking_id,
        amount,
        currency,
        provider,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, 'pending', datetime('now'))
    `).run(
      booking_id,
      amount,
      currency,
      provider
    )

    return res.json({
      ok: true,
      payment_id: result.lastInsertRowid,
      status: 'pending'
    })
  } catch (e) {
    console.error('PUBLIC /payment/intent error:', e)
    return res.status(500).json({ error: 'internal_error' })
  }
})

export default router
