import crypto from 'crypto';
import pkg from 'pg';

const { Pool } = pkg;

// NOTE: Keep pool creation local to this module to avoid changing boot sequence.
// This route must never block app.listen().
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function jsonStableStringify(obj) {
  // Deterministic hash for idempotency: stable keys ordering.
  // Avoids accidental hash changes due to key order differences.
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(jsonStableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${jsonStableStringify(obj[k])}`).join(',')}}`;
}

export async function confirmBooking(req, res) {
  const bookingId = String(req.params.id || '').trim();
  const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
  const actorType = String((req.body && req.body.actor_type) ? req.body.actor_type : 'system').trim() || 'system';

  if (!bookingId) return res.status(400).json({ ok: false, error: 'BOOKING_ID_REQUIRED' });
  if (!idempotencyKey) return res.status(400).json({ ok: false, error: 'IDEMPOTENCY_KEY_REQUIRED' });

  // Use stable stringify so identical bodies hash identically across clients.
  const rawBody = jsonStableStringify(req.body || {});
  const requestHash = crypto.createHash('sha256').update(rawBody).digest('hex');

  const client = await pool.connect();

  try {
    // 1) Fast idempotency hit (outside txn is OK, but we still use the same connection).
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

    // 2) Reserve idempotency key (within txn).
    try {
      await client.query(
        `INSERT INTO public.api_idempotency_keys (idempotency_key, endpoint, request_hash)
         VALUES ($1, $2, $3)`,
        [idempotencyKey, 'confirm_booking', requestHash]
      );
    } catch (e) {
      // Another request raced us: resolve deterministically.
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

    // 3) Actor in session var (safe).
    //    If triggers read it, it will be available only in this txn.
    await client.query(`SET LOCAL app.actor_type = $1`, [actorType]);

    // 4) Lock booking row and inspect status.
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

    const currentStatus = String(booking.rows[0].status || '').trim();

    // 5) Idempotent success on already confirmed.
    if (currentStatus === 'confirmed') {
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

    // 6) Production-grade hardening: only reserved can be confirmed.
    //    Fail-fast before hitting trigger errors.
    if (currentStatus !== 'reserved') {
      const responseBody = { ok: false, error: 'INVALID_STATUS', status: currentStatus };
      await client.query(
        `UPDATE public.api_idempotency_keys
            SET response_code = 409,
                response_body = $2
          WHERE idempotency_key = $1`,
        [idempotencyKey, responseBody]
      );
      await client.query('COMMIT');
      return res.status(409).json(responseBody);
    }

    // 7) DB-enforced confirm (triggers validate transitions).
    //    Also stamp confirmed_at for auditability (column exists in schema).
    try {
      await client.query(
        `UPDATE public.bookings
            SET status = 'confirmed',
                confirmed_at = NOW()
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