// routes_owner/index.js
import express from 'express';
import pool from '../db/index.js';
import { authOwner } from '../middleware/auth_owner.js';

const router = express.Router();
router.use(authOwner);

// READ
router.get('/salons', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT slug, name FROM salons ORDER BY name`
  );
  res.json({ ok: true, salons: rows });
});

router.get('/salons/:salonSlug/bookings', async (req, res) => {
  const { salonSlug } = req.params;
  const { from, to } = req.query;

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
});

// CANCEL
router.post('/bookings/:id/cancel', async (req, res) => {
  const id = Number(req.params.id);

  const { rowCount } = await pool.query(
    `
    UPDATE bookings
    SET status = 'cancelled'
    WHERE id = $1
      AND status IN ('pending_payment','paid')
    `,
    [id]
  );

  if (rowCount === 0) return res.json({ ok: true, status: 'no_change' });
  res.json({ ok: true, status: 'cancelled' });
});

// RESCHEDULE
router.post('/bookings/:id/reschedule', async (req, res) => {
  const id = Number(req.params.id);
  const { date, start_time } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM bookings WHERE id=$1 FOR UPDATE`,
      [id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok:false, error:'not_found' });
    }

    const b = rows[0];
    if (!['pending_payment','paid'].includes(b.status)) {
      await client.query('ROLLBACK');
      return res.json({ ok:true, status:'no_change' });
    }

    if (
      b.date.toISOString().slice(0,10) === date &&
      b.start_time === start_time
    ) {
      await client.query('ROLLBACK');
      return res.json({ ok:true, status:'no_change' });
    }

    const conflict = await client.query(
      `
      SELECT 1 FROM bookings
      WHERE salon_slug=$1
        AND master_slug=$2
        AND date=$3::date
        AND start_time=$4::time
        AND id<>$5
        AND status IN ('pending_payment','paid')
      `,
      [b.salon_slug, b.master_slug, date, start_time, id]
    );

    if (conflict.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok:false, error:'slot_conflict' });
    }

    const upd = await client.query(
      `
      UPDATE bookings
      SET date=$2::date, start_time=$3::time
      WHERE id=$1
      RETURNING id,date,start_time
      `,
      [id, date, start_time]
    );

    await client.query('COMMIT');
    res.json({ ok:true, booking: upd.rows[0] });
  } catch {
    await client.query('ROLLBACK');
    res.status(500).json({ ok:false, error:'reschedule_failed' });
  } finally {
    client.release();
  }
});

// MARK COMPLETED (WRITE.3)
router.post('/bookings/:id/complete', async (req, res) => {
  const id = Number(req.params.id);

  const { rowCount } = await pool.query(
    `
    UPDATE bookings
    SET status = 'completed'
    WHERE id = $1
      AND status = 'paid'
    `,
    [id]
  );

  if (rowCount === 0) {
    return res.json({ ok:true, status:'no_change' });
  }

  res.json({ ok:true, status:'completed' });
});

export default router;
