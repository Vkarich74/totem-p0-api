// routes/public_payment.js
import express from 'express'
import { getDB } from '../lib/db.js'

const router = express.Router()

// POST /public/payment/intent
// Creates a pending payment tied to an existing pending booking.
router.post('/intent', (req, res) => {
  try {
    const { booking_id, amount, currency, provider } = req.body || {}

    if (!booking_id || !amount || !provider) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'missing required fields'
      })
    }

    const amountInt = Number(amount)
    if (!Number.isFinite(amountInt) || amountInt <= 0) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'invalid amount'
      })
    }

    const db = getDB()

    // booking must exist and be pending
    const booking = db.prepare(`
      SELECT id, status
      FROM bookings
      WHERE id = ?
    `).get(booking_id)

    if (!booking) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'booking not found'
      })
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({
        error: 'validation_error',
        message: 'booking not payable'
      })
    }

    const cur = (currency || 'USD').toUpperCase()

    const result = db.prepare(`
      INSERT INTO payments (
        booking_id,
        amount,
        currency,
        provider,
        status
      )
      VALUES (?, ?, ?, ?, 'pending')
    `).run(
      booking.id,
      amountInt,
      cur,
      String(provider)
    )

    return res.json({
      ok: true,
      payment_id: result.lastInsertRowid,
      status: 'pending'
    })
  } catch (err) {
    console.error('PUBLIC /payment/intent error:', err)
    return res.status(500).json({ error: 'internal_error' })
  }
})

export default router
