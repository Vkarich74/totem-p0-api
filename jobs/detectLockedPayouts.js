import { db } from '../db/index.js';
import { createAlert } from '../services/alerts.js';

export function detectLockedPayouts() {
  const MAX_HOURS = Number(process.env.ALERT_PAYOUT_LOCK_HOURS || 24);
  const nowMs = Date.now();

  // читаем без предположений о схеме
  const payouts = db.prepare(`
    SELECT *
    FROM marketplace_payouts
    WHERE status = 'locked'
  `).all();

  for (const p of payouts) {
    // пытаемся найти таймстамп блокировки
    const ts =
      p.locked_at ||
      p.updated_at ||
      p.created_at ||
      null;

    if (!ts) continue;

    const lockedMs = new Date(ts).getTime();
    if (Number.isNaN(lockedMs)) continue;

    const hoursLocked = (nowMs - lockedMs) / (1000 * 60 * 60);

    if (hoursLocked > MAX_HOURS) {
      const payoutId = p.payout_id ?? p.id ?? 'unknown';

      createAlert({
        alert_type: 'payout_locked_too_long',
        entity_type: 'payout',
        entity_id: String(payoutId),
        severity: 'critical',
        message: `Payout locked longer than ${MAX_HOURS} hours`,
        meta: {
          hours_locked: Math.floor(hoursLocked),
          threshold_hours: MAX_HOURS,
          status: p.status,
          timestamp_used: ts
        }
      });
    }
  }
}
