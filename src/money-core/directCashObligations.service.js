'use strict';

import { computePaymentShareBreakdown } from './paymentProjectionMath.js';

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizePositiveInt(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeJson(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function normalizeMoney(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

async function loadPaymentContext(client, paymentId) {
  const result = await client.query(
    `
SELECT
  p.id,
  p.booking_id AS payment_booking_id,
  p.provider,
  p.status,
  p.amount,
  p.currency,
  p.collector_owner_type,
  p.collector_owner_id,
  p.confirmed_at,
  p.confirmed_by_user_id,
  p.created_at AS payment_created_at,
  b.id AS booking_id,
  b.salon_id,
  b.master_id,
  b.status AS booking_status,
  b.price_snapshot,
  b.service_id,
  b.start_at AS booking_start_at,
  b.start_at AS booking_datetime_start,
  b.created_at AS booking_created_at
FROM public.payments p
JOIN public.bookings b ON b.id = p.booking_id
WHERE p.id = $1
FOR UPDATE OF p, b
LIMIT 1
`,
    [paymentId]
  );

  return result.rows[0] || null;
}

async function paymentExistsWithoutBooking(client, paymentId) {
  const result = await client.query(
    `
SELECT id
FROM public.payments
WHERE id = $1
FOR UPDATE
LIMIT 1
`,
    [paymentId]
  );

  return Boolean(result.rows[0]);
}

async function loadApplicableContract(client, paymentRow, bookingRow) {
  const anchor =
    bookingRow.start_at ||
    bookingRow.datetime_start ||
    paymentRow.confirmed_at ||
    paymentRow.payment_created_at ||
    bookingRow.created_at ||
    null;

  if (!anchor) {
    return null;
  }

  const contractResult = await client.query(
    `
SELECT
  c.id,
  c.terms_json,
  c.created_at,
  c.effective_from,
  c.archived_at,
  c.status
FROM public.contracts c
WHERE c.salon_id::text = $1::text
AND c.master_id::text = $2::text
AND LOWER(COALESCE(c.terms_json->>'model', '')) IN ('percentage', 'hybrid')
AND c.created_at <= $3::timestamptz
AND (
  c.effective_from IS NULL
  OR (c.effective_from AT TIME ZONE 'Asia/Bishkek') <= $3::timestamptz
)
AND (c.archived_at IS NULL OR c.archived_at > $3::timestamptz)
ORDER BY COALESCE(c.effective_from, c.created_at) DESC, c.created_at DESC, c.id DESC
LIMIT 1
`,
    [
      String(bookingRow.salon_id ?? ''),
      String(bookingRow.master_id ?? ''),
      anchor,
    ]
  );

  return contractResult.rows[0] || null;
}

async function createDirectCashObligationsForConfirmedPayment(client, input = {}) {
  const reason = normalizeText(input.reason) || 'direct_cash_confirm';
  const route = normalizeText(input.route) || '/payments/direct/confirm-cash';
  const actor = normalizeJson(input.actor);
  const paymentId = normalizePositiveInt(input.paymentId ?? input.payment_id ?? input.payment?.id);

  if (!paymentId) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'PAYMENT_NOT_FOUND',
      inserted_count: 0,
      obligation: null,
    };
  }

  const paymentRow = await loadPaymentContext(client, paymentId);

  if (!paymentRow) {
    const paymentExists = await paymentExistsWithoutBooking(client, paymentId);
    return {
      ok: true,
      status: 'skipped',
      reason: paymentExists ? 'BOOKING_NOT_FOUND' : 'PAYMENT_NOT_FOUND',
      inserted_count: 0,
      obligation: null,
    };
  }

  const paymentProvider = String(paymentRow.provider || '').trim().toLowerCase();
  if (paymentProvider !== 'direct') {
    return {
      ok: true,
      status: 'skipped',
      reason: 'NOT_DIRECT_PAYMENT',
      inserted_count: 0,
      obligation: null,
    };
  }

  const paymentStatus = String(paymentRow.status || '').trim().toLowerCase();
  if (paymentStatus !== 'confirmed') {
    return {
      ok: true,
      status: 'skipped',
      reason: 'NOT_CONFIRMED_PAYMENT',
      inserted_count: 0,
      obligation: null,
    };
  }

  const collectorOwnerType = String(paymentRow.collector_owner_type || '').trim().toLowerCase();
  const collectorOwnerId = normalizePositiveInt(paymentRow.collector_owner_id);

  if (!collectorOwnerType) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'COLLECTOR_MISSING',
      inserted_count: 0,
      obligation: null,
    };
  }

  if (!['salon', 'master'].includes(collectorOwnerType)) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'INVALID_COLLECTOR_OWNER',
      inserted_count: 0,
      obligation: null,
    };
  }

  if (!collectorOwnerId) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'COLLECTOR_MISSING',
      inserted_count: 0,
      obligation: null,
    };
  }

  const bookingRow = {
    id: Number(paymentRow.booking_id),
    salon_id: normalizePositiveInt(paymentRow.salon_id),
    master_id: normalizePositiveInt(paymentRow.master_id),
    status: paymentRow.booking_status ?? null,
    price_snapshot: paymentRow.price_snapshot ?? null,
    service_id: paymentRow.service_id ?? null,
    start_at: paymentRow.booking_start_at ?? null,
    datetime_start: paymentRow.booking_datetime_start ?? null,
    created_at: paymentRow.booking_created_at ?? null,
  };

  const bookingStatus = String(bookingRow.status || '').trim().toLowerCase();
  if (bookingStatus === 'cancelled' || bookingStatus === 'canceled' || bookingStatus === 'rejected') {
    return {
      ok: true,
      status: 'skipped',
      reason: 'BOOKING_CANCELLED',
      inserted_count: 0,
      obligation: null,
    };
  }

  const expectedCollectorOwnerId = collectorOwnerType === 'salon'
    ? bookingRow.salon_id
    : bookingRow.master_id;

  if (!expectedCollectorOwnerId || collectorOwnerId !== expectedCollectorOwnerId) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'INVALID_COLLECTOR_OWNER',
      inserted_count: 0,
      obligation: null,
    };
  }

  const contract = await loadApplicableContract(client, paymentRow, bookingRow);
  if (!contract) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'CONTRACT_MISSING',
      inserted_count: 0,
      obligation: null,
    };
  }

  const shares = computePaymentShareBreakdown({
    payment: paymentRow,
    booking: bookingRow,
    contract,
  });

  if (!shares) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'SHARES_MISSING',
      inserted_count: 0,
      obligation: null,
    };
  }

  if (normalizeMoney(shares.platform_share) > 0) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'PLATFORM_SHARE_NONZERO_UNSUPPORTED_C20C',
      inserted_count: 0,
      obligation: null,
    };
  }

  const currency = normalizeText(paymentRow.currency) || normalizeText(shares.currency) || 'KGS';
  const paymentNumericId = Number(paymentRow.id);
  const bookingNumericId = Number(bookingRow.id);

  const directShareRole = collectorOwnerType === 'master' ? 'salon_share' : 'master_share';
  const obligationAmount = collectorOwnerType === 'master'
    ? normalizeMoney(shares.salon_share)
    : normalizeMoney(shares.master_share);

  if (!obligationAmount || obligationAmount <= 0) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'NO_SHARE_DUE',
      inserted_count: 0,
      obligation: null,
    };
  }

  const obligationPayload = {
    source: 'c20_direct_cash_obligation_bridge',
    reason,
    route,
    collector_owner_type: collectorOwnerType,
    collector_owner_id: collectorOwnerId,
    payment_id: paymentNumericId,
    booking_id: bookingNumericId,
    shares: {
      master_share: normalizeMoney(shares.master_share),
      salon_share: normalizeMoney(shares.salon_share),
      platform_share: normalizeMoney(shares.platform_share),
      share_residual: normalizeMoney(shares.share_residual),
    },
    actor: {
      type: normalizeText(actor.type) || normalizeText(actor.user_type) || 'system',
      user_id: Number.isInteger(Number(actor.user_id)) ? Number(actor.user_id) : null,
    },
  };

  const fromOwnerType = collectorOwnerType;
  const fromOwnerId = collectorOwnerId;
  const toOwnerType = collectorOwnerType === 'master' ? 'salon' : 'master';
  const toOwnerId = collectorOwnerType === 'master'
    ? bookingRow.salon_id
    : bookingRow.master_id;

  if (!toOwnerId) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'COLLECTOR_MISSING',
      inserted_count: 0,
      obligation: null,
    };
  }

  const insertResult = await client.query(
    `
INSERT INTO public.money_owner_obligations (
  source_type,
  source_id,
  payment_id,
  booking_id,
  from_owner_type,
  from_owner_id,
  to_owner_type,
  to_owner_id,
  amount,
  currency,
  status,
  obligation_type,
  split_role,
  metadata_json
) VALUES (
  'direct_payment',
  $1,
  $1,
  $2,
  $3,
  $4,
  $5,
  $6,
  $7,
  $8,
  'open',
  'direct_cash_split_due',
  $9,
  $10::jsonb
)
ON CONFLICT (
  source_type,
  source_id,
  from_owner_type,
  from_owner_id,
  to_owner_type,
  to_owner_id,
  obligation_type,
  COALESCE(split_role, ''::text)
) DO NOTHING
RETURNING *
`,
    [
      paymentNumericId,
      bookingNumericId,
      fromOwnerType,
      fromOwnerId,
      toOwnerType,
      toOwnerId,
      obligationAmount,
      currency,
      directShareRole,
      JSON.stringify(obligationPayload),
    ]
  );

  if (insertResult.rows[0]) {
    return {
      ok: true,
      status: 'created',
      reason: null,
      inserted_count: 1,
      obligation: insertResult.rows[0],
    };
  }

  const existingResult = await client.query(
    `
SELECT *
FROM public.money_owner_obligations
WHERE source_type = 'direct_payment'
  AND source_id = $1
  AND from_owner_type = $2
  AND from_owner_id = $3
  AND to_owner_type = $4
  AND to_owner_id = $5
  AND obligation_type = 'direct_cash_split_due'
  AND COALESCE(split_role, ''::text) = COALESCE($6, ''::text)
LIMIT 1
`,
    [
      paymentNumericId,
      fromOwnerType,
      fromOwnerId,
      toOwnerType,
      toOwnerId,
      directShareRole,
    ]
  );

  return {
    ok: true,
    status: 'exists',
    reason: 'OBLIGATION_ALREADY_EXISTS',
    inserted_count: 0,
    obligation: existingResult.rows[0] || null,
  };
}

export {
  createDirectCashObligationsForConfirmedPayment,
};
