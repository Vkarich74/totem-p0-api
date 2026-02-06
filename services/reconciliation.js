/**
 * Reconciliation Engine (ESM)
 *
 * Purpose:
 *  - Compare expected financial truth (intent) with actual provider payment
 *  - No DB
 *  - Deterministic
 */

import { createPaymentIntent } from "./payment_intent.js";
import { getPayment } from "./payment_provider_mock.js";

function normalizeNumber(n) {
  return typeof n === "number" && !isNaN(n) ? n : null;
}

export function reconcilePayment({
  booking_id,
  service_price,
  marketplace,
  payment_id
}) {
  if (!booking_id || !payment_id) {
    return { ok: false, error: "INVALID_RECONCILIATION_INPUT" };
  }

  const price = normalizeNumber(service_price);
  if (price === null || price <= 0) {
    return { ok: false, error: "INVALID_SERVICE_PRICE" };
  }

  // Expected truth (computed)
  const intentResult = createPaymentIntent({
    booking_id,
    service_price: price,
    marketplace
  });

  if (!intentResult.ok) {
    return { ok: false, error: intentResult.error || "INTENT_CALC_FAILED" };
  }

  const expectedIntent = intentResult.intent;

  // Actual truth (provider state)
  const payment = getPayment(payment_id);

  if (!payment) {
    return {
      ok: true,
      reconciliation: {
        booking_id,
        payment_id,
        state: "not_found",
        expected: expectedIntent,
        actual: null,
        mismatches: ["payment_not_found_in_provider"]
      }
    };
  }

  const mismatches = [];

  // Compare booking linkage
  if (payment.booking_id !== expectedIntent.booking_id) {
    mismatches.push("booking_id_mismatch");
  }

  // Compare currency
  if (payment.currency !== expectedIntent.currency) {
    mismatches.push("currency_mismatch");
  }

  // Compare amount
  if (payment.amount !== expectedIntent.amount_total) {
    mismatches.push("amount_mismatch");
  }

  // Compare type (marketplace/direct)
  if (payment.type !== expectedIntent.type) {
    mismatches.push("type_mismatch");
  }

  // Determine reconciliation state
  let state = "unknown";
  if (payment.status === "pending") state = "pending";
  if (payment.status === "succeeded") state = "succeeded";
  if (payment.status === "failed") state = "failed";

  return {
    ok: true,
    reconciliation: {
      booking_id,
      payment_id,
      state,
      expected: expectedIntent,
      actual: payment,
      mismatches
    }
  };
}
