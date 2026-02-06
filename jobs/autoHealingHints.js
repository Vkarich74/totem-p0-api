import { db } from '../db/index.js';

export function collectAutoHealingHints() {
  const hints = [];

  // BOOKINGS
  try {
    const rows = db.prepare('SELECT * FROM bookings').all();
    for (const r of rows) {
      const hasClient = r.client_id ?? r.user_id ?? r.customer_id ?? null;
      const hasPrice = r.price ?? r.amount ?? r.total ?? null;

      if (!hasClient) {
        hints.push({
          entity: 'booking',
          entity_id: r.id ?? null,
          hint: 'ADD_CLIENT_ID',
          reason: 'Retention & cohorts will not work'
        });
      }

      if (!hasPrice) {
        hints.push({
          entity: 'booking',
          entity_id: r.id ?? null,
          hint: 'ADD_PRICE',
          reason: 'GMV / ARPU / take-rate will be zero'
        });
      }
    }
  } catch (_) {}

  // COMMISSIONS
  try {
    const rows = db.prepare('SELECT * FROM marketplace_commissions').all();
    for (const r of rows) {
      if (!r.salon_id) {
        hints.push({
          entity: 'commission',
          entity_id: r.commission_id ?? r.id ?? null,
          hint: 'ADD_SALON_ID',
          reason: 'LTV and ARPU per salon will not work'
        });
      }
    }
  } catch (_) {}

  return hints;
}
