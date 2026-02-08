import pool from '../db.js';

export async function createBooking({
  salon_id,
  master_id,
  start_at,
  end_at,
  request_id
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Reserve calendar slot (idempotent)
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

    // 2. Create booking linked to slot
    const bookingRes = await client.query(
      `
      INSERT INTO bookings
        (salon_id, master_id, start_at, end_at, status, request_id, calendar_slot_id)
      VALUES
        ($1, $2, $3, $4, 'pending_payment', $5, $6)
      RETURNING id
      `,
      [salon_id, master_id, start_at, end_at, request_id, calendar_slot_id]
    );

    await client.query('COMMIT');
    return bookingRes.rows[0].id;
  } catch (e) {
    await client.query('ROLLBACK');

    // Calendar conflict (exclusion constraint)
    if (e.code === '23P01') {
      const err = new Error('CALENDAR_CONFLICT');
      err.code = 409;
      throw err;
    }

    // Idempotency duplicate
    if (e.code === '23505') {
      const err = new Error('DUPLICATE_REQUEST');
      err.code = 400;
      throw err;
    }

    throw e;
  } finally {
    client.release();
  }
}
