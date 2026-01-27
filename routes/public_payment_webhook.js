// routes/public_payment_webhook.js
import express from 'express'
import { getDB } from '../lib/db.js'
import { requireWebhookToken } from '../middleware/anti_bypass_public.js'

const router = express.Router()

// POST /public/payment/webhook
// protected: requires PAYMENT_WEBHOOK_TOKEN
router.post('/webhook', requireWebhookToken, (req, res) => {
  const { payment_id, status } = req.body

  if (!payment_id || !status) {
    return res.status(400).json({ error: 'validation_error' })
  }

  try {
    const db = getDB()

    const payment = db.prepare(`
      SELECT id, booking_id, status AS current_status
      FROM payments
      WHERE id = ?
    `).get(payment_id)

    if (!payment) {
      return res.status(400).json({ error: 'payment not found' })
    }

    // update payment status
    db.prepare(`
      UPDATE payments
      SET status = ?
      WHERE id = ?
    `).run(status, payment_id)

    // if payment succeeded -> mark booking paid
    if (status === 'succeeded') {
      db.prepare(`
        UPDATE bookings
        SET status = 'paid'
        WHERE id = ?
      `).run(payment.booking_id)
    }

    return res.json({ ok: true })
  } catch (e) {
    console.error('PAYMENT WEBHOOK error:', e)
    return res.status(500).json({ error: 'internal_error' })
  }
})

export default router
