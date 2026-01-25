// lib/overlap.js

export function hhmmToMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Единственная точка проверки пересечений.
 * Работает ТОЛЬКО по master_id + salon_id (ID, не slug).
 */
export function assertNoOverlap({
  db,
  master_id,
  salon_id,
  date,
  start_time,
  end_time
}) {
  const sMin = hhmmToMin(start_time);
  const eMin = hhmmToMin(end_time);

  // BOOKINGS
  const bookings = db.prepare(`
    SELECT start_time, end_time
    FROM bookings
    WHERE master_id = ?
      AND salon_id = ?
      AND date = ?
      AND active = 1
      AND cancelled_at IS NULL
  `).all(master_id, salon_id, date);

  for (const b of bookings) {
    if (overlaps(sMin, eMin, hhmmToMin(b.start_time), hhmmToMin(b.end_time))) {
      throw { code: 409, msg: "overlaps_booking" };
    }
  }

  // BLOCKS
  const blocks = db.prepare(`
    SELECT start_time, end_time
    FROM blocks
    WHERE master_id = ?
      AND salon_id = ?
      AND date = ?
      AND active = 1
  `).all(master_id, salon_id, date);

  for (const b of blocks) {
    if (overlaps(sMin, eMin, hhmmToMin(b.start_time), hhmmToMin(b.end_time))) {
      throw { code: 409, msg: "overlaps_block" };
    }
  }
}
