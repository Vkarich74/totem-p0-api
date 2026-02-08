import db from '../db.js';

const VERSION = 'booking-service-v2026-02-09-final-no-conflict';

export async function createBooking({
  salon_id,
  master_id,
  start_at,
  end_at,
  request_id
}) {
  console.log('[BOOKING_CREATE][VERSION]', VERSION);

  try {
    // BEGIN TRANSACTION
    await db.run('BEGIN');

    // 1. INSERT calendar slot
    // IMPORTANT:
    // - partial unique index on request_id
    // - exclusion constraint handles overlaps
    // - correct PostgreSQL syntax: ON CONFLICT DO NOTHING
    await db.run(
      `
      INSERT INTO calendar_slots
        (master_id, salon_id, start_at, end_at, status, request_id)
      VALUES
        ($1, $2, $3, $4, 'reserved', $5)
      ON CONFLICT DO NOTHING
      `,
      [
        master_id,
        salon_id,
        start_at,
        end_at,
        request_id
      ]
    );

    // 2. Fetch slot by request_id
    const slot = await db.get(
      `
      SELECT id
      FROM calendar_slots
      WHERE request_id = $1
      `,
      [request_id]
    );

    if (!slot || !slot.id) {
      const err = new Error('CALENDAR_CONFLICT');
      err.code = 409;
      throw err;
    }

    // 3. Create booking linked to slot
    const booking = await db.get(
      `
      INSERT INTO bookings
        (
          salon_id,
          salon_slug,
          master_id,
          start_at,
          end_at,
          status,
          request_id,
          calendar_slot_id
        )
      VALUES
        ($1, $2, $3, $4, $5, 'pending_payment', $6, $7)
      RETURNING id
      `,
      [
        salon_id,
        String(salon_id), // salon_slug fallback
        master_id,
        start_at,
        end_at,
        request_id,
        slot.id
      ]
    );

    // COMMIT
    await db.run('COMMIT');

    return booking.id;

  } catch (e) {
    await db.run('ROLLBACK');
    console.error('[BOOKING_CREATE][ERROR]', VERSION, e);
    throw e;
  }
}
