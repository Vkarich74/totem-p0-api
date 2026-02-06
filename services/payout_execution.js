/**
 * Payout Execution Engine (ESM)
 *
 * Purpose:
 *  - Execute payout once per succeeded payment
 *  - Idempotent (in-memory)
 *  - No DB
 */

import { getPayoutPreview } from "./payout_preview.js";

const executedPayouts = new Map();

function generatePayoutId() {
  return "payout_" + Math.random().toString(36).substring(2, 12);
}

export function executePayout({
  booking_id,
  service_price,
  marketplace,
  payment_id
}) {
  if (executedPayouts.has(payment_id)) {
    return {
      ok: false,
      error: "PAYOUT_ALREADY_EXECUTED",
      payout_id: executedPayouts.get(payment_id).payout_id
    };
  }

  const previewResult = getPayoutPreview({
    booking_id,
    service_price,
    marketplace,
    payment_id
  });

  if (!previewResult.ok) {
    return previewResult;
  }

  const payout_id = generatePayoutId();

  const payout = {
    payout_id,
    booking_id,
    payment_id,
    currency: previewResult.payout_preview.currency,
    marketplace_amount: previewResult.payout_preview.marketplace_amount,
    provider_amount: previewResult.payout_preview.provider_amount,
    status: "executed"
  };

  executedPayouts.set(payment_id, payout);

  return {
    ok: true,
    payout
  };
}
