import { db } from '../db/index.js';

/**
 * Проверка качества данных.
 * НИЧЕГО не пишет в бизнес-таблицы.
 * Только сигналы.
 */
export function runDataDisciplineCheck() {
  const alerts = [];

  // BOOKINGS
  try {
    const rows = db.prepare('SELECT * FROM bookings').all();
    for (const r of rows) {
      const hasClient =
        r.client_id ?? r.user_id ?? r.customer_id ?? null;
      const hasDate =
        r.created_at ?? r.booked_at ?? r.date ?? null;

      if (!hasClient || !hasDate) {
        alerts.push({
          type: 'booking_data_incomplete',
          entity: 'booking',
          entity_id: r.id ?? null,
          meta: {
            has_client: Boolean(hasClient),
            has_date: Boolean(hasDate)
          }
        });
      }
    }
  } catch (_) {}

  // COMMISSIONS
  try {
    const rows = db.prepare('SELECT * FROM marketplace_commissions').all();
    for (const r of rows) {
      if (!r.amount) {
        alerts.push({
          type: 'commission_missing_amount',
          entity: 'commission',
          entity_id: r.id ?? null,
          meta: {}
        });
      }
      if (!r.salon_id) {
        alerts.push({
          type: 'commission_missing_salon',
          entity: 'commission',
          entity_id: r.id ?? null,
          meta: {}
        });
      }
    }
  } catch (_) {}

  return alerts;
}
