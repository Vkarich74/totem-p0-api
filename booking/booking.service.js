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

  // 1) IDEMPOTENCY FIRST
  const findSql =
    db.mode === 'POSTGRES'
      ? `SELECT id FROM bookings WHERE request_id = $1`
      : `SELECT id FROM bookings WHERE request_id = ?`;

  const existing = await db.get(findSql, [request_id]);
  if (existing) {
    return existing.id;
  }

  // 2) RESOLVE salon_slug (PROD requires NOT NULL salon_slug)
  const salonSql =
    db.mode === 'POSTGRES'
      ? `SELECT slug FROM salons WHERE id = $1`
      : `SELECT slug FROM salons WHERE id = ?`;

  const salonRow = await db.get(salonSql, [Number(salon_id)]);
  if (!salonRow || !salonRow.slug) {
    const err = new Error('SALON_NOT_FOUND');
    err.code = 400;
    throw err;
  }
  const salon_slug = String(salonRow.slug);

  // 3) CALENDAR = SOURCE OF TRUTH (only for new request_id)
  await reserveSlot({ salon_id, master_id, start_at, end_at, request_id });

  // 4) INSERT booking with salon_slug
  const insertSql =
    db.mode === 'POSTGRES'
      ? `
        INSERT INTO bookings
          (salon_id, salon_slug, master_id, start_at, end_at, status, request_id)
        VALUES ($1,$2,$3,$4,$5,'reserved',$6)
        RETURNING id
      `
      : `
        INSERT INTO bookings
          (salon_id, salon_slug, master_id, start_at, end_at, status, request_id)
        VALUES (?,?,?,?,?,'reserved',?)
      `;

  if (db.mode === 'POSTGRES') {
    const row = await db.get(insertSql, [
      Number(salon_id),
      salon_slug,
      Number(master_id),
      start_at,
      end_at,
      request_id
    ]);
    return row.id;
  } else {
    await db.run(insertSql, [
      Number(salon_id),
      salon_slug,
      Number(master_id),
      start_at,
      end_at,
      request_id
    ]);
    const row = await db.get(`SELECT last_insert_rowid() as id`);
    return row.id;
  }
}
