import db from '../db.js';

export async function reserveSlot({ master_id, salon_id, start_at, end_at }) {
  const conflictSql =
    db.mode === 'POSTGRES'
      ? `
        SELECT 1 FROM calendar_slots
        WHERE master_id = $1
          AND status = 'reserved'
          AND start_at < $3
          AND end_at > $2
        LIMIT 1
      `
      : `
        SELECT 1 FROM calendar_slots
        WHERE master_id = ?
          AND status = 'reserved'
          AND start_at < ?
          AND end_at > ?
        LIMIT 1
      `;

  const conflict = await db.get(conflictSql, [
    Number(master_id),
    start_at,
    end_at
  ]);

  if (conflict) {
    const err = new Error('CALENDAR_CONFLICT');
    err.code = 409;
    throw err;
  }

  const insertSql =
    db.mode === 'POSTGRES'
      ? `
        INSERT INTO calendar_slots
        (master_id, salon_id, start_at, end_at, status)
        VALUES ($1,$2,$3,$4,'reserved')
      `
      : `
        INSERT INTO calendar_slots
        (master_id, salon_id, start_at, end_at, status)
        VALUES (?,?,?,?, 'reserved')
      `;

  await db.run(insertSql, [
    Number(master_id),
    Number(salon_id),
    start_at,
    end_at
  ]);
}

export async function getMasterCalendar(master_id) {
  const sql =
    db.mode === 'POSTGRES'
      ? `
        SELECT * FROM calendar_slots
        WHERE master_id = $1
          AND status = 'reserved'
          AND end_at >= NOW()
        ORDER BY start_at
      `
      : `
        SELECT * FROM calendar_slots
        WHERE master_id = ?
          AND status = 'reserved'
          AND end_at >= datetime('now')
        ORDER BY start_at
      `;

  return db.all(sql, [Number(master_id)]);
}
