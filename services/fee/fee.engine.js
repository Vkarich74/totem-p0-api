// services/fee/fee.engine.js
// ===========================
// Fee Engine — deterministic
// ===========================

import { pool } from "../../db/index.js";

/**
 * Load active fee rules for given scope.
 * applies_to examples: 'payment', 'payout', 'service'
 */
export async function loadFeeRules(appliesTo) {
  const res = await pool.query(
    `
    SELECT id, percent, fixed_cents
    FROM fee_rules
    WHERE active = true AND applies_to = $1
    ORDER BY id ASC
    `,
    [appliesTo]
  );

  return res.rows;
}

/**
 * Apply fee rules to base amount.
 * Returns breakdown + total fee.
 */
export function applyFees({ amountCents, rules }) {
  if (amountCents <= 0) throw new Error("amountCents must be positive");

  let totalFee = 0;
  const breakdown = [];

  for (const rule of rules) {
    let fee = 0;

    if (rule.percent !== null) {
      fee += Math.round(amountCents * (Number(rule.percent) / 100));
    }

    if (rule.fixed_cents !== null) {
      fee += Number(rule.fixed_cents);
    }

    if (fee > 0) {
      breakdown.push({
        ruleId: rule.id,
        feeCents: fee,
      });
      totalFee += fee;
    }
  }

  return {
    totalFeeCents: totalFee,
    netAmountCents: amountCents - totalFee,
    breakdown,
  };
}
