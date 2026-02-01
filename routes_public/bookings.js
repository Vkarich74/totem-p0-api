// routes_public/bookings.js
import express from 'express';
import pool from '../db/index.js';
import { idempotencyGuard } from '../middleware/idempotency.js';
import { slotFloodGuard } from '../middleware/slot_flood.js';

const router = express.Router();

// POST /public/bookings
router.post('/', slotFloodGuard, idempotencyGuard, async (req, res) => {
  const {
    salon_slug,
    master_slug,
    service_id,
    date,
    start_time,
    request_id,
  } = req.body;

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO bookings
        (salon_slug, master_slug, service_id, date, start_time, status, request_id)
      VALUES
        ($1, $2, $3, $4, $5, 'pending_payment', $6)
      RETURNING id
      `,
      [salon_slug, master_slug, service_id, date, start_time, request_id]
    );

    res.json({ ok: true, booking_id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      res.status(409).json({ ok: false, error: 'duplicate_request' });
      return;
    }
    res.status(500).json({ ok: false, error: 'create_booking_failed' });
  }
});

export default router;
