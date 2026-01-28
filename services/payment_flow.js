/**
 * Payment Flow Orchestrator (ESM)
 *
 * Payment is NOT finalized here.
 * Final status comes from webhook.
 */

import { createPaymentIntent } from "./payment_intent.js";
import { createPayment } from "./payment_provider_mock.js";

export function runPaymentFlow({
  booking_id,
  service_price,
  marketplace
}) {
  const intentResult = createPaymentIntent({
    booking_id,
    service_price,
    marketplace
  });

  if (!intentResult.ok) {
    return {
      ok: false,
      step: "intent",
      error: intentResult.error
    };
  }

  const intent = intentResult.intent;

  const providerCreateResult = createPayment(intent);

  if (!providerCreateResult.ok) {
    return {
      ok: false,
      step: "provider_create",
      error: providerCreateResult.error
    };
  }

  return {
    ok: true,
    flow: {
      booking_id,
      intent,
      payment: providerCreateResult.payment
    }
  };
}
