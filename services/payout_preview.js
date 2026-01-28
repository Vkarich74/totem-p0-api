/**
 * Payout Preview Engine (ESM)
 *
 * Purpose:
 *  - Calculate payout amounts for succeeded payments
 *  - No DB
 *  - No side effects
 */

import { reconcilePayment } from "./reconciliation.js";

export function getPayoutPreview({
  booking_id,
  service_price,
  marketplace,
  payment_id
}) {
  const reconciliationResult = reconcilePayment({
    booking_id,
    service_price,
    marketplace,
    payment_id
  });

  if (!reconciliationResult.ok) {
    return reconciliationResult;
  }

  const { reconciliation } = reconciliationResult;

  if (reconciliation.state !== "succeeded") {
    return {
      ok: false,
      error: "PAYOUT_NOT_ALLOWED",
      state: reconciliation.state
    };
  }

  const expected = reconciliation.expected;

  return {
    ok: true,
    payout_preview: {
      booking_id,
      payment_id,
      currency: expected.currency,
      total_amount: expected.amount_total,
      marketplace_amount: expected.marketplace_amount,
      provider_amount: expected.provider_amount
    }
  };
}
