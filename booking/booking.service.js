import db from '../db.js';
import { reserveSlot } from '../calendar/calendar.service.js';

export async function createBooking({ salon_id, master_id, start_at, end_at }) {
  // 1) calendar — источник истины (ловит конфликты)
  await reserveSlot({ salon_id, master_id, start_at, end_at });

  // 2) booking — тонкий слой
  const insertSql =
    db.mode === 'POSTGRES'
      ? `
        INSERT INTO bookings (salon_id, master_id, start_at, end_at, status)
        VALUES ($1,$2,$3,$4,'reserved')
        RETURNING id
      `
      : `
        INSERT INTO bookings (salon_id, master_id, start_at, end_at, status)
        VALUES (?,?,?,?, 'reserved')
      `;

  if (db.mode === 'POSTGRES') {
    const row = await db.get(insertSql, [
      Number(salon_id),
      Number(master_id),
      start_at,
      end_at
    ]);
    return row.id;
  } else {
    await db.run(insertSql, [
      Number(salon_id),
      Number(master_id),
      start_at,
      end_at
    ]);
    const row = await db.get(`SELECT last_insert_rowid() as id`);
    return row.id;
  }
}
