// routes_owner/index.js
import express from 'express';
import pool from '../db/index.js';
import { authOwner } from '../middleware/auth_owner.js';

const router = express.Router();

// STRICT AUTH
router.use(authOwner);

/**
 * GET /owner/salons
 * Returns list of salons
 */
router.get('/salons', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, name FROM salons ORDER BY name`
    );
    res.json({ ok: true, salons: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'salons_fetch_failed' });
  }
});

/**
 * GET /owner/salons/:salonSlug/bookings
 * Optional query: from=YYYY-MM-DD, to=YYYY-MM-DD
 */
router.get('/salons/:salonSlug/bookings', async (req, res) => {
  const { salonSlug } = req.params;
  const { from, to } = req.query;

  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        master_slug,
        service_id,
        date,
        start_time,
        status,
        created_at
      FROM bookings
      WHERE salon_slug = $1
        AND ($2::date IS NULL OR date >= $2::date)
        AND ($3::date IS NULL OR date <= $3::date)
      ORDER BY date, start_time
      `,
      [salonSlug, from || null, to || null]
    );

    res.json({ ok: true, bookings: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'bookings_fetch_failed' });
  }
});

export default router;
