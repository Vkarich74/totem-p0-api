import db from '../db.js';

export async function createBooking({
  salon_id,
  master_id,
  start_at,
  end_at,
  request_id
}) {
  try {
    // BEGIN TRANSACTION
    await db.run('BEGIN');

    // 1. Reserve calendar slot (idempotent)
    const slotInsert =
      db.mode === 'POSTGRES'
        ? `
          INSERT INTO calendar_slots
            (master_id, salon_id, start_at, end_at, status, request_id)
          VALUES
            ($1, $2, $3, $4, 'reserved', $5)
          ON CONFLICT (request_id)
          DO UPDATE SET request_id = EXCLUDED.request_id
          RETURNING id
        `
        : `
          INSERT OR IGNORE INTO calendar_slots
            (master_id, salon_id, start_at, end_at, status, request_id)
          VALUES
            (?, ?, ?, ?, 'reserved', ?)
        `;

    const slotRes =
      db.mode === 'POSTGRES'
        ? await db.get(slotInsert, [
            master_id,
            salon_id,
            start_at,
            end_at,
            request_id
          ])
        : await db.get(
            `SELECT id FROM calendar_slots WHERE request_id = ?`,
            [request_id]
          );

    if (!slotRes || !slotRes.id) {
      throw Object.assign(new Error('CALENDAR_CONFLICT'), { code: 409 });
    }

    const calendar_slot_id = slotRes.id;

    // 2. Create booking linked to calendar slot
    const bookingInsert =
      db.mode === 'POSTGRES'
        ? `
          INSERT INTO bookings
            (salon_id, master_id, start_at, end_at, status, request_id, calendar_slot_id)
          VALUES
            ($1, $2, $3, $4, 'pending_payment', $5, $6)
          RETURNING id
        `
        : `
          INSERT INTO bookings
            (salon_id, master_id, start_at, end_at, status, request_id, calendar_slot_id)
          VALUES
            (?, ?, ?, ?, 'pending_payment', ?, ?)
        `;

    const bookingRes =
      db.mode === 'POSTGRES'
        ? await db.get(bookingInsert, [
            salon_id,
            master_id,
            start_at,
            end_at,
            request_id,
            calendar_slot_id
          ])
        : (() => {
            db.run(bookingInsert, [
              salon_id,
              master_id,
              start_at,
              end_at,
              request_id,
              calendar_slot_id
            ]);
            return db.get(
              `SELECT id FROM bookings WHERE request_id = ?`,
              [request_id]
            );
          })();

    // COMMIT
    await db.run('COMMIT');

    return bookingRes.id;
  } catch (e) {
    await db.run('ROLLBACK');

    if (e.code === 409) throw e;

    if (e.code === '23505') {
      const err = new Error('DUPLICATE_REQUEST');
      err.code = 400;
      throw err;
    }

    throw e;
  }
}
