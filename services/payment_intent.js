/**
 * Payment Intent Engine (ESM)
 */

import { calculatePayout } from "./payout.js";

export function createPaymentIntent({
  booking_id,
  service_price,
  marketplace
}) {
  if (
    !booking_id ||
    typeof service_price !== "number" ||
    isNaN(service_price) ||
    service_price <= 0
  ) {
    return {
      ok: false,
      error: "INVALID_PAYMENT_INTENT_INPUT"
    };
  }

  const payoutResult = calculatePayout({
    service_price,
    marketplace
  });

  if (!payoutResult.ok) {
    return payoutResult;
  }

  return {
    ok: true,
    intent: {
      booking_id,
      amount_total: service_price,
      currency: "USD",
      type: payoutResult.type,
      commission_amount: payoutResult.commission_amount,
      provider_amount: payoutResult.provider_amount,
      marketplace_amount: payoutResult.marketplace_amount,
      status: "intent_created"
    }
  };
}
