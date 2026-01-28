// routes/public_payment_webhook.js
import express from 'express'
import { getDB } from '../lib/db.js'

const router = express.Router()

// POST /public/payment/webhook
// Protected by X-Payment-Token == PAYMENT_WEBHOOK_TOKEN
router.post('/webhook', (req, res) => {
  try {
    const token = req.headers['x-payment-token']
    if (!token || token !== process.env.PAYMENT_WEBHOOK_TOKEN) {
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

    // Only allow state changes via webhook
    if (String(status) === 'succeeded') {
      // idempotent: if already succeeded, keep it succeeded
      db.prepare(`UPDATE payments SET status = 'succeeded' WHERE id = ?`).run(payment.id)
      db.prepare(`UPDATE bookings SET status = 'paid' WHERE id = ?`).run(payment.booking_id)
    } else if (String(status) === 'failed') {
      db.prepare(`UPDATE payments SET status = 'failed' WHERE id = ?`).run(payment.id)
      // booking stays pending (P0/P1 simple)
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
