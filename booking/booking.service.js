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

  const existing =
    db.mode === 'POSTGRES'
      ? await db.get(
          `SELECT id FROM bookings WHERE request_id=$1`,
          [request_id]
        )
      : await db.get(
          `SELECT id FROM bookings WHERE request_id=?`,
          [request_id]
        );

  if (existing) {
    return existing.id;
  }

  // ⬅️ calendar теперь ИДЕМПОТЕНТЕН
  await reserveSlot({
    salon_id,
    master_id,
    start_at,
    end_at,
    request_id
  });

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
