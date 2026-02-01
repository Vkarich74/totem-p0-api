// routes_owner/index.js
import express from 'express';
import pool from '../db/index.js';
import { authOwner } from '../middleware/auth_owner.js';

const router = express.Router();

// STRICT AUTH
router.use(authOwner);

/**
 * GET /owner/salons
 */
router.get('/salons', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, name FROM salons ORDER BY name`
    );
    res.json({ ok: true, salons: rows });
  } catch {
    res.status(500).json({ ok: false, error: 'salons_fetch_failed' });
  }
});

/**
 * GET /owner/salons/:salonSlug/bookings
 */
router.get('/salons/:salonSlug/bookings', async (req, res) => {
  const { salonSlug } = req.params;
  const { from, to } = req.query;

  try {
    const { rows } = await pool.query(
      `
      SELECT id, master_slug, service_id, date, start_time, status, created_at
      FROM bookings
      WHERE salon_slug = $1
        AND ($2::date IS NULL OR date >= $2::date)
        AND ($3::date IS NULL OR date <= $3::date)
      ORDER BY date, start_time
      `,
      [salonSlug, from || null, to || null]
    );

    res.json({ ok: true, bookings: rows });
  } catch {
    res.status(500).json({ ok: false, error: 'bookings_fetch_failed' });
  }
});

/**
 * POST /owner/bookings/:id/cancel
 * Idempotent cancel
 */
router.post('/bookings/:id/cancel', async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId)) {
    return res.status(400).json({ ok: false, error: 'invalid_booking_id' });
  }

  try {
    const { rowCount, rows } = await pool.query(
      `
      UPDATE bookings
      SET status = 'cancelled'
      WHERE id = $1
        AND status IN ('pending_payment', 'paid')
      RETURNING id, status
      `,
      [bookingId]
    );

    // idempotent: already cancelled / expired
    if (rowCount === 0) {
      return res.json({ ok: true, status: 'no_change' });
    }

    res.json({ ok: true, booking: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'cancel_failed' });
  }
});

export default router;
