import db from '../db.js';
import { reserveSlot } from '../calendar/calendar.service.js';

export async function createBooking({
  salon_id,
  master_id,
  start_at,
  end_at,
  request_id
}) {
  if (!request_id) {
    const err = new Error('REQUEST_ID_REQUIRED');
    err.code = 400;
    throw err;
  }

  // 1) IDEMPOTENCY CHECK
  const findSql =
    db.mode === 'POSTGRES'
      ? `SELECT id FROM bookings WHERE request_id = $1`
      : `SELECT id FROM bookings WHERE request_id = ?`;

  const existing = await db.get(findSql, [request_id]);
  if (existing) {
    return existing.id;
  }

  // 2) CALENDAR = SOURCE OF TRUTH
  await reserveSlot({ salon_id, master_id, start_at, end_at });

  // 3) CREATE BOOKING
  const insertSql =
    db.mode === 'POSTGRES'
      ? `
        INSERT INTO bookings
          (salon_id, master_id, start_at, end_at, status, request_id)
        VALUES ($1,$2,$3,$4,'reserved',$5)
        RETURNING id
      `
      : `
        INSERT INTO bookings
          (salon_id, master_id, start_at, end_at, status, request_id)
        VALUES (?,?,?,?, 'reserved', ?)
      `;

  if (db.mode === 'POSTGRES') {
    const row = await db.get(insertSql, [
      Number(salon_id),
      Number(master_id),
      start_at,
      end_at,
      request_id
    ]);
    return row.id;
  } else {
    await db.run(insertSql, [
      Number(salon_id),
      Number(master_id),
      start_at,
      end_at,
      request_id
    ]);
    const row = await db.get(`SELECT last_insert_rowid() as id`);
    return row.id;
  }
}
