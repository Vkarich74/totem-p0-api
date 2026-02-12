const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function confirmBooking(req, res) {
  const bookingId = String(req.params.id || '').trim();
  const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
  const actorType = String((req.body && req.body.actor_type) ? req.body.actor_type : 'system').trim() || 'system';

  if (!bookingId) return res.status(400).json({ ok: false, error: 'BOOKING_ID_REQUIRED' });
  if (!idempotencyKey) return res.status(400).json({ ok: false, error: 'IDEMPOTENCY_KEY_REQUIRED' });

  const rawBody = JSON.stringify(req.body || {});
  const requestHash = crypto.createHash('sha256').update(rawBody).digest('hex');

  const client = await pool.connect();

  try {
    // 1) idempotency hit
    const existing = await client.query(
      `SELECT request_hash, response_code, response_body
         FROM public.api_idempotency_keys
        WHERE idempotency_key = $1
        LIMIT 1`,
      [idempotencyKey]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];

      if (row.request_hash !== requestHash) {
        return res.status(409).json({ ok: false, error: 'IDEMPOTENCY_KEY_CONFLICT' });
      }

      if (row.response_code && row.response_body) {
        return res.status(row.response_code).json(row.response_body);
      }

      return res.status(409).json({ ok: false, error: 'IDEMPOTENCY_IN_PROGRESS' });
    }

    await client.query('BEGIN');

    // 2) reserve key
    try {
      await client.query(
        `INSERT INTO public.api_idempotency_keys (idempotency_key, endpoint, request_hash)
         VALUES ($1, $2, $3)`,
        [idempotencyKey, 'confirm_booking', requestHash]
      );
    } catch (e) {
      // race: someone inserted same key
      const again = await client.query(
        `SELECT request_hash, response_code, response_body
           FROM public.api_idempotency_keys
          WHERE idempotency_key = $1
          LIMIT 1`,
        [idempotencyKey]
      );

      if (again.rows.length > 0) {
        const r = again.rows[0];
        if (r.request_hash !== requestHash) {
          await client.query('ROLLBACK');
          return res.status(409).json({ ok: false, error: 'IDEMPOTENCY_KEY_CONFLICT' });
        }
        if (r.response_code && r.response_body) {
          await client.query('ROLLBACK');
          return res.status(r.response_code).json(r.response_body);
        }
      }

      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'IDEMPOTENCY_IN_PROGRESS' });
    }

    // 3) actor in session var (safe even if trigger doesn't use it yet)
    await client.query(`SET LOCAL app.actor_type = $1`, [actorType]);

    // 4) lock booking
    const booking = await client.query(
      `SELECT id, status
         FROM public.bookings
        WHERE id = $1
        FOR UPDATE`,
      [bookingId]
    );

    if (booking.rows.length === 0) {
      const responseBody = { ok: false, error: 'BOOKING_NOT_FOUND' };
      await client.query(
        `UPDATE public.api_idempotency_keys
            SET response_code = 404,
                response_body = $2
          WHERE idempotency_key = $1`,
        [idempotencyKey, responseBody]
      );
      await client.query('COMMIT');
      return res.status(404).json(responseBody);
    }

    // idempotent by state
    if (booking.rows[0].status === 'confirmed') {
      const responseBody = { ok: true, status: 'already_confirmed' };
      await client.query(
        `UPDATE public.api_idempotency_keys
            SET response_code = 200,
                response_body = $2
          WHERE idempotency_key = $1`,
        [idempotencyKey, responseBody]
      );
      await client.query('COMMIT');
      return res.status(200).json(responseBody);
    }

    // 5) DB-enforced confirm (trigger checks payments + transitions)
    try {
      await client.query(
        `UPDATE public.bookings
            SET status = 'confirmed'
          WHERE id = $1`,
        [bookingId]
      );
    } catch (e) {
      const responseBody = { ok: false, error: 'CONFIRM_FAILED', details: e.message };
      await client.query(
        `UPDATE public.api_idempotency_keys
            SET response_code = 400,
                response_body = $2
          WHERE idempotency_key = $1`,
        [idempotencyKey, responseBody]
      );
      await client.query('COMMIT');
      return res.status(400).json(responseBody);
    }

    const responseBody = { ok: true, status: 'confirmed' };
    await client.query(
      `UPDATE public.api_idempotency_keys
          SET response_code = 200,
              response_body = $2
        WHERE idempotency_key = $1`,
      [idempotencyKey, responseBody]
    );

    await client.query('COMMIT');
    return res.status(200).json(responseBody);

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', details: err.message });
  } finally {
    client.release();
  }
}

module.exports = { confirmBooking };
