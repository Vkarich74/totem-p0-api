// routes/public_payment_webhook.js
import express from 'express'
import { getDB } from '../lib/db.js'

const router = express.Router()

// POST /public/payment/webhook
// Protected by X-Public-Token === 'prod_public_token_123'
router.post('/webhook', (req, res) => {
  try {
    const token = req.headers['x-public-token']
    if (token !== 'prod_public_token_123') {
      return res.status(401).json({ error: 'unauthorized' })
    }

    const { payment_id, status } = req.body || {}

    if (!payment_id || !status) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'missing required fields'
      })
    }

    const db = getDB()

    const payment = db.prepare(`
      SELECT id, booking_id, status
      FROM payments
      WHERE id = ?
    `).get(payment_id)

    if (!payment) {
      return res.status(404).json({ error: 'payment not found' })
    }

    if (status === 'succeeded') {
      // idempotent updates
      db.prepare(`
        UPDATE payments
        SET status = 'succeeded'
        WHERE id = ?
      `).run(payment.id)

      db.prepare(`
        UPDATE bookings
        SET status = 'paid'
        WHERE id = ?
      `).run(payment.booking_id)
    } else if (status === 'failed') {
      db.prepare(`
        UPDATE payments
        SET status = 'failed'
        WHERE id = ?
      `).run(payment.id)
    } else {
      return res.status(400).json({
        error: 'validation_error',
        message: 'unknown status'
      })
    }

    return res.json({ ok: true })
  } catch (err) {
    console.error('PUBLIC /payment/webhook error:', err)
    return res.status(500).json({ error: 'internal_error' })
  }
})

export default router
