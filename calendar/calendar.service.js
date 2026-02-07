import db from '../db.js';

/**
 * RESERVE SLOT (IDEMPOTENT)
 */
export async function reserveSlot({
  master_id,
  salon_id,
  start_at,
  end_at,
  request_id
}) {
  // 1) IDEMPOTENCY FIRST
  if (request_id) {
    const existing =
      db.mode === 'POSTGRES'
        ? await db.get(
            `SELECT id FROM calendar_slots WHERE request_id=$1`,
            [request_id]
          )
        : await db.get(
            `SELECT id FROM calendar_slots WHERE request_id=?`,
            [request_id]
          );

    if (existing) {
      return existing.id;
    }
  }

  // 2) CONFLICT CHECK
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

  // 3) INSERT SLOT
  const insertSql =
    db.mode === 'POSTGRES'
      ? `
        INSERT INTO calendar_slots
          (master_id, salon_id, start_at, end_at, status, request_id)
        VALUES ($1,$2,$3,$4,'reserved',$5)
        RETURNING id
      `
      : `
        INSERT INTO calendar_slots
          (master_id, salon_id, start_at, end_at, status, request_id)
        VALUES (?,?,?,?, 'reserved', ?)
      `;

  if (db.mode === 'POSTGRES') {
    const row = await db.get(insertSql, [
      Number(master_id),
      Number(salon_id),
      start_at,
      end_at,
      request_id || null
    ]);
    return row.id;
  } else {
    await db.run(insertSql, [
      Number(master_id),
      Number(salon_id),
      start_at,
      end_at,
      request_id || null
    ]);
    const row = await db.get(`SELECT last_insert_rowid() as id`);
    return row.id;
  }
}

/**
 * READ MASTER CALENDAR
 * используется calendar.routes.js
 */
export async function getMasterCalendar(master_id) {
  const sql =
    db.mode === 'POSTGRES'
      ? `
        SELECT id, salon_id, start_at, end_at, status
        FROM calendar_slots
        WHERE master_id = $1
        ORDER BY start_at
      `
      : `
        SELECT id, salon_id, start_at, end_at, status
        FROM calendar_slots
        WHERE master_id = ?
        ORDER BY start_at
      `;

  return db.all(sql, [Number(master_id)]);
}
