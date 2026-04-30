'use strict';

const XPAY_SUCCESS_STATUSES = new Set([
  'success',
  'succeeded',
  'paid',
  'paid_out',
  'approved',
  'captured',
  'completed',
  'complete',
  'settled',
  'done',
]);

const XPAY_PROCESSING_STATUSES = new Set([
  'pending',
  'new',
  'created',
  'processing',
  'in_progress',
  'queued',
  'received',
  'waiting',
]);

const XPAY_FAILED_STATUSES = new Set([
  'failed',
  'error',
  'declined',
  'rejected',
  'canceled',
  'cancelled',
  'voided',
  'expired',
]);

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeXpayStatus(rawStatus) {
  const normalized = String(rawStatus || '').trim().toLowerCase();

  if (!normalized) {
    return 'requires_review';
  }

  if (XPAY_SUCCESS_STATUSES.has(normalized)) {
    return 'processed';
  }

  if (XPAY_PROCESSING_STATUSES.has(normalized)) {
    return 'processing';
  }

  if (XPAY_FAILED_STATUSES.has(normalized)) {
    return 'failed';
  }

  if (normalized === 'requires_review' || normalized === 'review' || normalized === 'manual_review') {
    return 'requires_review';
  }

  return 'requires_review';
}

function deepSanitizePayload(value) {
  if (Array.isArray(value)) {
    return value.map((item) => deepSanitizePayload(item));
  }

  if (value && typeof value === 'object' && value.constructor === Object) {
    const output = {};
    for (const [key, childValue] of Object.entries(value)) {
      const lowered = String(key).trim().toLowerCase();
      if (lowered === 'secret' || lowered === 'token' || lowered === 'password' || lowered === 'authorization' || lowered === 'signature') {
        continue;
      }
      output[key] = deepSanitizePayload(childValue);
    }
    return output;
  }

  return value;
}

function normalizeXpayEvent(input = {}) {
  const rawStatus = input.status_raw ?? input.status ?? input.payment_status ?? input.state ?? null;
  const statusNormalized = normalizeXpayStatus(rawStatus);

  const providerObjectType = normalizeText(
    input.provider_object_type ?? input.object_type ?? input.entity_type ?? input.target_type ?? null
  );

  const providerObjectId = normalizeText(
    input.provider_object_id ?? input.object_id ?? input.entity_id ?? input.target_id ?? null
  );

  const amountRaw = input.amount ?? input.total_amount ?? input.sum ?? null;
  const amount = amountRaw === null || amountRaw === undefined || amountRaw === ''
    ? null
    : Number(amountRaw);

  return {
    provider_code: 'xpay',
    event_type: normalizeText(input.event_type ?? input.type ?? input.kind ?? 'payment_webhook') || 'payment_webhook',
    provider_event_id: normalizeText(input.provider_event_id ?? input.event_id ?? input.id ?? input.webhook_id ?? null),
    provider_object_type: providerObjectType,
    provider_object_id: providerObjectId,
    payment_id: input.payment_id ?? null,
    booking_id: input.booking_id ?? null,
    amount: Number.isFinite(amount) && amount >= 0 ? amount : null,
    currency: 'KGS',
    status_raw: normalizeText(rawStatus),
    status_normalized: statusNormalized,
    payload_sanitized: deepSanitizePayload(input.payload ?? input.body ?? input.raw_payload ?? input),
    signature_valid: typeof input.signature_valid === 'boolean' ? input.signature_valid : null,
    received_at: input.received_at ?? null,
    processed_at: input.processed_at ?? null,
    processing_status: normalizeText(input.processing_status ?? null) || 'received',
    processing_error: normalizeText(input.processing_error ?? null),
    idempotency_key: normalizeText(input.idempotency_key ?? input.request_id ?? input.idempotency ?? null),
  };
}

export {
  normalizeXpayStatus,
  normalizeXpayEvent,
};
