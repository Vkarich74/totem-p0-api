// routes_public/bookings.js
import express from 'express';
import pool from '../db/index.js';
import { idempotencyGuard } from '../middleware/idempotency.js';
import { slotFloodGuard } from '../middleware/slot_flood.js';

const router = express.Router();

/**
 * POST /public/bookings
 *
 * FLOW (ATOMIC):
 * 1. BEGIN
 * 2. Resolve salon_id, master_id
 * 3. Reserve calendar slot
 * 4. Create booking with calendar_slot_id
 * 5. COMMIT
 * Any error -> ROLLBACK
 */
router.post('/', slotFloodGuard, idempotencyGuard, async (req, res) => {
  const client = await pool.connect();

  const {
    salon_slug,
    master_slug,
    service_id,
    start_at,
    end_at,
    request_id,
  } = req.body;

  try {
    await client.query('BEGIN');

    // 1. Resolve salon_id
    const salonRes = await client.query(
      `SELECT id FROM salons WHERE slug = $1`,
      [salon_slug]
    );
    if (salonRes.rowCount === 0) {
      throw new Error('SALON_NOT_FOUND');
    }
    const salon_id = salonRes.rows[0].id;

    // 2. Resolve master_id
    const masterRes = await client.query(
      `SELECT id FROM masters WHERE slug = $1`,
      [master_slug]
    );
    if (masterRes.rowCount === 0) {
      throw new Error('MASTER_NOT_FOUND');
    }
    const master_id = masterRes.rows[0].id;

    // 3. Reserve calendar slot (idempotent)
    const slotRes = await client.query(
      `
      INSERT INTO calendar_slots
        (master_id, salon_id, start_at, end_at, status, request_id)
      VALUES
        ($1, $2, $3, $4, 'reserved', $5)
      ON CONFLICT (request_id)
      DO UPDATE SET request_id = EXCLUDED.request_id
      RETURNING id
      `,
      [master_id, salon_id, start_at, end_at, request_id]
    );

    const calendar_slot_id = slotRes.rows[0].id;

    // 4. Create booking linked to calendar slot
    const bookingRes = await client.query(
      `
      INSERT INTO bookings
        (salon_id, salon_slug, master_id, status, request_id, calendar_slot_id)
      VALUES
        ($1, $2, $3, 'pending_payment', $4, $5)
      RETURNING id
      `,
      [salon_id, salon_slug, master_id, request_id, calendar_slot_id]
    );

    await client.query('COMMIT');

    res.json({
      ok: true,
      booking_id: bookingRes.rows[0].id,
      calendar_slot_id,
    });
  } catch (err) {
    await client.query('ROLLBACK');

    if (err.code === '23P01') {
      res.status(409).json({ ok: false, error: 'CALENDAR_CONFLICT' });
      return;
    }

    if (err.code === '23505') {
      res.status(409).json({ ok: false, error: 'duplicate_request' });
      return;
    }

    res.status(500).json({ ok: false, error: 'create_booking_failed' });
  } finally {
    client.release();
  }
});

export default router;
