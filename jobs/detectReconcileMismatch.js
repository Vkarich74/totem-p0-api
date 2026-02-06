import { db } from '../db/index.js';
import { createAlert } from '../services/alerts.js';

export function detectReconcileMismatch() {
  // 1) читаем всё, не предполагая схему
  const commissions = db.prepare(`
    SELECT *
    FROM marketplace_commissions
  `).all();

  const payouts = db.prepare(`
    SELECT *
    FROM marketplace_payouts
    WHERE status IN ('locked','paid')
  `).all();

  // 2) группируем комиссии по payout_id (если есть)
  const commissionByPayout = {};

  for (const c of commissions) {
    if (!c.payout_id) continue; // если нет связи — пропускаем (это НОРМА)

    if (!commissionByPayout[c.payout_id]) {
      commissionByPayout[c.payout_id] = 0;
    }

    commissionByPayout[c.payout_id] += Number(c.amount || 0);
  }

  // 3) сравниваем с payouts
  for (const p of payouts) {
    const payoutId = p.payout_id ?? p.id;
    if (!payoutId) continue;

    const commissionSum = Number(commissionByPayout[payoutId] || 0);
    const payoutAmount = Number(p.amount || 0);

    // если нет комиссий — НЕ алертим (возможно ещё не посчитаны)
    if (commissionSum === 0) continue;

    if (commissionSum !== payoutAmount) {
      createAlert({
        alert_type: 'reconcile_mismatch',
        entity_type: 'payout',
        entity_id: String(payoutId),
        severity: 'critical',
        message: 'Payout amount does not match commissions sum',
        meta: {
          payout_amount: payoutAmount,
          commission_sum: commissionSum,
          payout_status: p.status
        }
      });
    }
  }
}
