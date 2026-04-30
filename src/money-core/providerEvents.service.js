'use strict';

import { getProviderDefinition } from './providers/registry.js';
import { normalizeXpayEvent } from './providers/xpay.adapter.js';

const ALLOWED_PROCESSING_STATUSES = new Set([
  'received',
  'ignored_duplicate',
  'processing',
  'processed',
  'failed',
  'requires_review',
]);

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeOwnerLikeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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

function normalizeGenericProviderStatus(rawStatus) {
  const normalized = String(rawStatus || '').trim().toLowerCase();

  if (!normalized) {
    return 'requires_review';
  }

  if (['success', 'succeeded', 'paid', 'completed', 'complete', 'settled', 'approved', 'captured', 'done'].includes(normalized)) {
    return 'processed';
  }

  if (['pending', 'new', 'created', 'processing', 'queued', 'in_progress', 'received', 'waiting'].includes(normalized)) {
    return 'processing';
  }

  if (['failed', 'error', 'declined', 'rejected', 'cancelled', 'canceled', 'expired', 'voided'].includes(normalized)) {
    return 'failed';
  }

  if (['requires_review', 'review', 'manual_review'].includes(normalized)) {
    return 'requires_review';
  }

  return 'requires_review';
}

function normalizeProviderEvent(input = {}) {
  const providerCode = normalizeText(input.provider_code ?? input.provider ?? 'manual')?.toLowerCase() || 'manual';
  const provider = getProviderDefinition(providerCode);

  if (providerCode === 'xpay') {
    const normalized = normalizeXpayEvent(input);
    return {
      ...normalized,
      provider_code: 'xpay',
    };
  }

  const rawStatus = input.status_raw ?? input.status ?? input.provider_status ?? null;
  const statusNormalized = normalizeGenericProviderStatus(rawStatus);

  const amountRaw = input.amount ?? input.total_amount ?? input.sum ?? null;
  const amount = amountRaw === null || amountRaw === undefined || amountRaw === ''
    ? null
    : Number(amountRaw);

  const processingStatus = normalizeText(input.processing_status ?? null);
  const safeProcessingStatus = ALLOWED_PROCESSING_STATUSES.has(processingStatus) ? processingStatus : 'received';

  return {
    provider_code: provider ? provider.code : providerCode,
    event_type: normalizeText(input.event_type ?? input.type ?? input.kind ?? 'provider_event') || 'provider_event',
    provider_event_id: normalizeText(input.provider_event_id ?? input.event_id ?? input.id ?? null),
    provider_object_type: normalizeText(input.provider_object_type ?? input.object_type ?? null),
    provider_object_id: normalizeText(input.provider_object_id ?? input.object_id ?? null),
    payment_id: normalizeOwnerLikeNumber(input.payment_id ?? null),
    booking_id: normalizeOwnerLikeNumber(input.booking_id ?? null),
    amount: Number.isFinite(amount) && amount >= 0 ? amount : null,
    currency: 'KGS',
    status_raw: normalizeText(rawStatus),
    status_normalized: statusNormalized,
    payload_sanitized: deepSanitizePayload(input.payload ?? input.body ?? input.raw_payload ?? input),
    signature_valid: typeof input.signature_valid === 'boolean' ? input.signature_valid : null,
    received_at: input.received_at ?? null,
    processed_at: input.processed_at ?? null,
    processing_status: safeProcessingStatus,
    processing_error: normalizeText(input.processing_error ?? null),
    idempotency_key: normalizeText(input.idempotency_key ?? input.request_id ?? input.idempotency ?? null),
  };
}

async function createProviderEvent(pool, input = {}) {
  const event = normalizeProviderEvent(input);

  const insertResult = await pool.query(
    `
    INSERT INTO public.provider_events (
      provider_code,
      event_type,
      provider_event_id,
      provider_object_type,
      provider_object_id,
      payment_id,
      booking_id,
      amount,
      currency,
      status_raw,
      status_normalized,
      payload_sanitized,
      signature_valid,
      received_at,
      processed_at,
      processing_status,
      processing_error,
      idempotency_key,
      created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      COALESCE($14, now()),
      $15,
      $16,
      $17,
      $18,
      now()
    )
    ON CONFLICT DO NOTHING
    RETURNING *
    `,
    [
      event.provider_code,
      event.event_type,
      event.provider_event_id,
      event.provider_object_type,
      event.provider_object_id,
      event.payment_id,
      event.booking_id,
      event.amount,
      event.currency || 'KGS',
      event.status_raw,
      event.status_normalized,
      event.payload_sanitized,
      event.signature_valid,
      event.received_at,
      event.processed_at,
      event.processing_status,
      event.processing_error,
      event.idempotency_key,
    ]
  );

  if (insertResult.rows[0]) {
    return insertResult.rows[0];
  }

  if (event.provider_event_id) {
    const existingByEventId = await pool.query(
      `
      SELECT *
      FROM public.provider_events
      WHERE provider_code = $1
        AND provider_event_id = $2
      ORDER BY id ASC
      LIMIT 1
      `,
      [event.provider_code, event.provider_event_id]
    );

    if (existingByEventId.rows[0]) {
      return existingByEventId.rows[0];
    }
  }

  if (event.idempotency_key) {
    const existingByIdempotencyKey = await pool.query(
      `
      SELECT *
      FROM public.provider_events
      WHERE idempotency_key = $1
      ORDER BY id ASC
      LIMIT 1
      `,
      [event.idempotency_key]
    );

    if (existingByIdempotencyKey.rows[0]) {
      return existingByIdempotencyKey.rows[0];
    }
  }

  return null;
}

async function listProviderEvents(pool, filters = {}) {
  const where = [];
  const values = [];
  let index = 1;

  if (filters.provider_code) {
    where.push(`provider_code = $${index++}`);
    values.push(normalizeText(filters.provider_code));
  }

  if (filters.payment_id !== undefined && filters.payment_id !== null && filters.payment_id !== '') {
    where.push(`payment_id = $${index++}`);
    values.push(normalizeOwnerLikeNumber(filters.payment_id));
  }

  if (filters.booking_id !== undefined && filters.booking_id !== null && filters.booking_id !== '') {
    where.push(`booking_id = $${index++}`);
    values.push(normalizeOwnerLikeNumber(filters.booking_id));
  }

  if (filters.processing_status) {
    where.push(`processing_status = $${index++}`);
    values.push(normalizeText(filters.processing_status));
  }

  if (filters.status_normalized) {
    where.push(`status_normalized = $${index++}`);
    values.push(normalizeText(filters.status_normalized));
  }

  if (filters.event_type) {
    where.push(`event_type = $${index++}`);
    values.push(normalizeText(filters.event_type));
  }

  const limit = Number.isInteger(Number(filters.limit)) && Number(filters.limit) > 0
    ? Math.min(Number(filters.limit), 500)
    : 100;

  const offset = Number.isInteger(Number(filters.offset)) && Number(filters.offset) >= 0
    ? Number(filters.offset)
    : 0;

  values.push(limit);
  const limitIndex = index++;
  values.push(offset);
  const offsetIndex = index++;

  const sql = `
    SELECT *
    FROM public.provider_events
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC, id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
  `;

  const result = await pool.query(sql, values);
  return result.rows;
}

async function getProviderEventById(pool, id) {
  const eventId = normalizeOwnerLikeNumber(id);
  if (eventId === null) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT *
    FROM public.provider_events
    WHERE id = $1
    LIMIT 1
    `,
    [eventId]
  );

  return result.rows[0] || null;
}

export {
  normalizeProviderEvent,
  createProviderEvent,
  listProviderEvents,
  getProviderEventById,
};
