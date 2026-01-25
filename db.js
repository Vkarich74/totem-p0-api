import Database from "better-sqlite3";

const db = new Database("totem.db");

// ===== CONTEXT =====
export function getBookingContextBySlugs(db, { master_slug, salon_slug }) {
  return db.prepare(`
    SELECT
      m.id AS master_id, m.active AS master_active,
      s.id AS salon_id,  s.active AS salon_active,
      sm.active AS link_active
    FROM masters m
    JOIN salon_masters sm ON sm.master_id = m.id
    JOIN salons s ON s.id = sm.salon_id
    WHERE m.slug = ? AND s.slug = ?
    LIMIT 1
  `).get(master_slug, salon_slug);
}

// ===== SCHEDULE =====
export function getActiveScheduleForWeekday(db, { master_id, salon_id, weekday }) {
  return db.prepare(`
    SELECT start_time, end_time
    FROM master_schedule
    WHERE master_id = ?
      AND salon_id = ?
      AND weekday = ?
      AND active = 1
    ORDER BY start_time
  `).all(master_id, salon_id, weekday);
}

// ===== BOOKINGS =====
export function getBookingsForDate(db, { master_id, salon_id, date }) {
  return db.prepare(`
    SELECT start_time, end_time
    FROM bookings
    WHERE master_id = ?
      AND salon_id = ?
      AND date = ?
      AND active = 1
  `).all(master_id, salon_id, date);
}

// ===== BLOCKS =====
export function getBlocksForDate(db, { master_id, salon_id, date }) {
  return db.prepare(`
    SELECT start_time, end_time
    FROM booking_blocks
    WHERE master_id = ?
      AND salon_id = ?
      AND date = ?
      AND active = 1
  `).all(master_id, salon_id, date);
}

export default db;
