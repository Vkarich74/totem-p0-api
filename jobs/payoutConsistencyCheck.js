import { db } from "../db/index.js";

/**
 * System job — payout consistency check (B17.2)
 * Uses real schema:
 * - payouts.net_amount
 * - payouts.total_paid
 * - payouts.total_commission
 */
export function checkPayoutConsistency() {
  let payouts = [];
  const errors = [];

  // Load payouts safely
  try {
    payouts = db.prepare(`
      SELECT
        id,
        net_amount,
        total_paid,
        total_commission,
        status
      FROM payouts
    `).all();
  } catch (e) {
    return {
      ok: false,
      checked: 0,
      errors: [
        {
          error: "DB_ERROR",
          stage: "SELECT payouts",
          message: e.message,
        },
      ],
    };
  }

  for (const p of payouts) {
    const net = Number(p.net_amount);
    const paid = Number(p.total_paid);
    const commission = Number(p.total_commission);

    // invariant 1: no negative monetary values
    if (net < 0 || paid < 0 || commission < 0) {
      errors.push({
        payout_id: p.id,
        error: "NEGATIVE_MONETARY_VALUE",
        net_amount: net,
        total_paid: paid,
        total_commission: commission,
      });
      continue;
    }

    // invariant 2: total_paid = net_amount + total_commission
    const expectedPaid = Math.round((net + commission) * 100) / 100;
    const actualPaid = Math.round(paid * 100) / 100;

    if (expectedPaid !== actualPaid) {
      errors.push({
        payout_id: p.id,
        error: "PAYOUT_TOTAL_MISMATCH",
        expected_total_paid: expectedPaid,
        actual_total_paid: actualPaid,
        net_amount: net,
        total_commission: commission,
      });
    }

    // invariant 3: paid payout must have positive net_amount
    if (p.status === "paid" && net === 0) {
      errors.push({
        payout_id: p.id,
        error: "PAID_WITH_ZERO_NET_AMOUNT",
      });
    }
  }

  return {
    ok: errors.length === 0,
    checked: payouts.length,
    errors,
  };
}

export default { checkPayoutConsistency };
