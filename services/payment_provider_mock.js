/**
 * Mock Payment Provider (ESM)
 *
 * Async model:
 * - createPayment → status: pending
 * - confirm/fail ONLY via webhook
 */

const payments = new Map();

function generatePaymentId() {
  return "pay_" + Math.random().toString(36).substring(2, 12);
}

export function createPayment(intent) {
  if (!intent || intent.status !== "intent_created") {
    return {
      ok: false,
      error: "INVALID_PAYMENT_INTENT"
    };
  }

  const payment_id = generatePaymentId();

  const payment = {
    payment_id,
    booking_id: intent.booking_id,
    amount: intent.amount_total,
    currency: intent.currency,
    type: intent.type,
    status: "pending"
  };

  payments.set(payment_id, payment);

  return {
    ok: true,
    payment
  };
}

export function applyWebhookEvent({ payment_id, event }) {
  const payment = payments.get(payment_id);

  if (!payment) {
    return {
      ok: false,
      error: "PAYMENT_NOT_FOUND"
    };
  }

  if (event === "payment_succeeded") {
    payment.status = "succeeded";
  } else if (event === "payment_failed") {
    payment.status = "failed";
  } else {
    return {
      ok: false,
      error: "UNKNOWN_WEBHOOK_EVENT"
    };
  }

  return {
    ok: true,
    payment
  };
}

export function getPayment(payment_id) {
  return payments.get(payment_id) || null;
}
