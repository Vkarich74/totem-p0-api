// middleware/idempotency.js
// Idempotency guard for POST /public/bookings
// Contract:
// - request_id REQUIRED (string)
// - 409 if duplicate
// - DB-safe with explicit connect/release

import pool from '../db/index.js';

export async function idempotencyGuard(req, res, next) {
  const requestId = req.body?.request_id;

  if (!requestId || typeof requestId !== 'string') {
    res.status(400).json({
      ok: false,
      error: 'request_id_required',
    });
    return;
  }

  let client;
  try {
    client = await pool.connect();

    const { rowCount } = await client.query(
      'SELECT 1 FROM bookings WHERE request_id = $1 LIMIT 1',
      [requestId]
    );

    if (rowCount > 0) {
      res.status(409).json({
        ok: false,
        error: 'duplicate_request',
      });
      return;
    }

    next();
  } catch (err) {
    console.error('[IDEMPOTENCY ERROR]', err.message);
    res.status(500).json({
      ok: false,
      error: 'idempotency_check_failed',
    });
  } finally {
    if (client) client.release();
  }
}
