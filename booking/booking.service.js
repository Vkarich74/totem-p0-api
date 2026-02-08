import db from '../db.js';

export async function createBooking({
  salon_id,
  master_id,
  start_at,
  end_at,
  request_id
}) {
  try {
    await db.run('BEGIN');

    // 1. Try insert calendar slot (idempotent, conflict-safe)
    const slotInsert =
      db.mode === 'POSTGRES'
        ? `
          INSERT INTO calendar_slots
            (master_id, salon_id, start_at, end_at, status, request_id)
          VALUES
            ($1, $2, $3, $4, 'reserved', $5)
          ON CONFLICT DO NOTHING
        `
        : `
          INSERT OR IGNORE INTO calendar_slots
            (master_id, salon_id, start_at, end_at, status, request_id)
          VALUES
            (?, ?, ?, ?, 'reserved', ?)
        `;

    await db.run(slotInsert, [
      master_id,
      salon_id,
      start_at,
      end_at,
      request_id
    ]);

    // 2. Fetch slot by request_id
    const slotRow = await db.get(
      db.mode === 'POSTGRES'
        ? `SELECT id FROM calendar_slots WHERE request_id = $1`
        : `SELECT id FROM calendar_slots WHERE request_id = ?`,
      [request_id]
    );

    if (!slotRow || !slotRow.id) {
      const err = new Error('CALENDAR_CONFLICT');
      err.code = 409;
      throw err;
    }

    const calendar_slot_id = slotRow.id;

    // 3. Create booking linked to slot
    const bookingInsert =
      db.mode === 'POSTGRES'
        ? `
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
        `
        : `
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
            (?, ?, ?, ?, ?, 'pending_payment', ?, ?)
        `;

    const bookingRow =
      db.mode === 'POSTGRES'
        ? await db.get(bookingInsert, [
            salon_id,
            String(salon_id), // salon_slug fallback
            master_id,
            start_at,
            end_at,
            request_id,
            calendar_slot_id
          ])
        : (() => {
            db.run(bookingInsert, [
              salon_id,
              String(salon_id),
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

    await db.run('COMMIT');
    return bookingRow.id;

  } catch (e) {
    await db.run('ROLLBACK');

    // overlap via exclusion constraint
    if (e.code === '23P01') {
      const err = new Error('CALENDAR_CONFLICT');
      err.code = 409;
      throw err;
    }

    // idempotency
    if (e.code === '23505') {
      const err = new Error('DUPLICATE_REQUEST');
      err.code = 400;
      throw err;
    }

    throw e;
  }
}
