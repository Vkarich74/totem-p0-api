'use strict';

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizePositiveInt(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeAmount(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sanitizeJson(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item));
  }

  if (value && typeof value === 'object' && value.constructor === Object) {
    const output = {};
    for (const [key, childValue] of Object.entries(value)) {
      const lowered = String(key).trim().toLowerCase();
      if (
        lowered === 'secret' ||
        lowered === 'token' ||
        lowered === 'password' ||
        lowered === 'authorization' ||
        lowered === 'signature'
      ) {
        continue;
      }
      output[key] = sanitizeJson(childValue);
    }
    return output;
  }

  return value;
}

function createError(code, message, statusCode = 400) {
  const error = new Error(message || code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function buildSettlementId(paymentId) {
  return `xpay:payment:${paymentId}`;
}

function buildItemMetadata(paymentRow, bookingRow, input = {}) {
  return sanitizeJson({
    source: 'c20_h_xpay_provider_settlement_item_bridge',
    payment_id: Number(paymentRow.id),
    booking_id: Number(bookingRow.id),
    salon_id: Number(bookingRow.salon_id),
    master_id: Number(bookingRow.master_id),
    provider: 'xpay',
    reason: normalizeText(input.reason) || 'xpay_confirmed_payment',
    route: normalizeText(input.route) || '/payments/xpay/status',
  });
}

async function loadXpayPaymentContext(client, paymentId) {
  const result = await client.query(
    `
SELECT
  p.id,
  p.booking_id,
  p.provider,
  p.status,
  p.amount,
  p.currency,
  p.method,
  p.confirmed_at,
  p.created_at AS payment_created_at,
  p.qr_transaction_id,
  b.id AS booking_row_id,
  b.salon_id,
  b.master_id,
  b.status AS booking_status,
  b.service_id,
  b.price_snapshot,
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

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    payment: {
      id: Number(row.id),
      booking_id: Number(row.booking_id),
      provider: row.provider,
      status: row.status,
      amount: row.amount,
      currency: row.currency,
      method: row.method,
      confirmed_at: row.confirmed_at,
      created_at: row.payment_created_at,
      qr_transaction_id: row.qr_transaction_id,
    },
    booking: {
      id: Number(row.booking_row_id),
      salon_id: normalizePositiveInt(row.salon_id),
      master_id: normalizePositiveInt(row.master_id),
      status: row.booking_status,
      service_id: row.service_id,
      price_snapshot: row.price_snapshot,
      start_at: row.booking_start_at,
      datetime_start: row.booking_datetime_start,
      created_at: row.booking_created_at,
    },
  };
}

async function getOrCreateXpaySettlementBucket(client, paymentRow, bookingRow, input = {}) {
  const deterministicSettlementId = buildSettlementId(paymentRow.id);
  const amount = normalizeAmount(paymentRow.amount);
  const amountGross = amount ?? 0;
  const amountNet = amount ?? 0;

  const insertSettlementResult = await client.query(
    `
INSERT INTO public.provider_settlements (
  provider_code,
  settlement_source,
  provider_settlement_id,
  status,
  amount_gross,
  amount_fee,
  amount_net,
  currency,
  hold_started_at,
  hold_until,
  settlement_eligible_at,
  requested_at,
  submitted_at,
  expected_bank_date,
  bank_received_at,
  bank_reference,
  manual_confirmed_by,
  manual_confirmed_at,
  metadata_json,
  created_at,
  updated_at
) VALUES (
  'xpay',
  'api',
  $1,
  'draft',
  $2,
  0,
  $3,
  COALESCE($4, 'KGS'),
  COALESCE($5::timestamptz, now()),
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  $6::jsonb,
  now(),
  now()
)
ON CONFLICT (provider_code, provider_settlement_id) DO NOTHING
RETURNING id
    `,
    [
      deterministicSettlementId,
      amountGross,
      amountNet,
      paymentRow.currency || 'KGS',
      paymentRow.confirmed_at || paymentRow.created_at || bookingRow.created_at || null,
      JSON.stringify(sanitizeJson({
        source: 'c20_h_xpay_provider_settlement_item_bridge',
        payment_id: Number(paymentRow.id),
        booking_id: Number(bookingRow.id),
        salon_id: Number(bookingRow.salon_id),
        master_id: Number(bookingRow.master_id),
        provider: 'xpay',
        route: normalizeText(input.route) || '/payments/xpay/status',
      })),
    ]
  );

  if (insertSettlementResult.rows[0]?.id) {
    return insertSettlementResult.rows[0].id;
  }

  const existingSettlementResult = await client.query(
    `
SELECT id
FROM public.provider_settlements
WHERE provider_code = 'xpay'
  AND provider_settlement_id = $1
LIMIT 1
    `,
    [deterministicSettlementId]
  );

  return existingSettlementResult.rows[0]?.id || null;
}

async function createProviderSettlementItemForXpayPayment(client, input = {}) {
  if (!client || typeof client.query !== 'function') {
    throw createError('MONEY_CORE_DB_CLIENT_REQUIRED', 'Database client is required', 500);
  }

  const paymentId = normalizePositiveInt(input.paymentId ?? input.payment_id);
  if (!paymentId) {
    throw createError('PAYMENT_ID_INVALID', 'paymentId is required', 400);
  }

  const context = await loadXpayPaymentContext(client, paymentId);
  if (!context?.payment || !context?.booking) {
    throw createError('PAYMENT_NOT_FOUND', 'Payment or booking not found', 404);
  }

  const paymentRow = context.payment;
  const bookingRow = context.booking;

  if (String(paymentRow.provider || '').trim().toLowerCase() !== 'xpay') {
    return {
      ok: true,
      status: 'skipped',
      reason: 'NOT_XPAY_PAYMENT',
      provider_settlement_id: null,
      provider_settlement_item_id: null,
      inserted_count: 0,
    };
  }

  if (String(paymentRow.status || '').trim().toLowerCase() !== 'confirmed') {
    return {
      ok: true,
      status: 'skipped',
      reason: 'NOT_CONFIRMED_PAYMENT',
      provider_settlement_id: null,
      provider_settlement_item_id: null,
      inserted_count: 0,
    };
  }

  const amount = normalizeAmount(paymentRow.amount);
  if (amount === null || amount <= 0) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'NO_AMOUNT_DUE',
      provider_settlement_id: null,
      provider_settlement_item_id: null,
      inserted_count: 0,
    };
  }

  const bookingStatus = String(bookingRow.status || '').trim().toLowerCase();
  if (['cancelled', 'canceled', 'rejected', 'failed', 'refunded'].includes(bookingStatus)) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'BOOKING_CANCELLED',
      provider_settlement_id: null,
      provider_settlement_item_id: null,
      inserted_count: 0,
    };
  }

  if (!bookingRow.salon_id || !bookingRow.master_id) {
    throw createError('MISSING_SALON_OR_MASTER', 'Booking must have salon and master', 409);
  }

  const existingItemResult = await client.query(
    `
SELECT psi.id, psi.provider_settlement_id
FROM public.provider_settlement_items psi
JOIN public.provider_settlements ps ON ps.id = psi.provider_settlement_id
WHERE ps.provider_code = 'xpay'
  AND ps.provider_settlement_id = $1
  AND psi.payment_id = $2
LIMIT 1
    `,
    [buildSettlementId(paymentRow.id), paymentRow.id]
  );

  if (existingItemResult.rows[0]) {
    return {
      ok: true,
      status: 'exists',
      reason: 'PROVIDER_SETTLEMENT_ITEM_ALREADY_EXISTS',
      provider_settlement_id: existingItemResult.rows[0].provider_settlement_id,
      provider_settlement_item_id: existingItemResult.rows[0].id,
      inserted_count: 0,
    };
  }

  const providerSettlementId = await getOrCreateXpaySettlementBucket(
    client,
    paymentRow,
    bookingRow,
    input
  );

  if (!providerSettlementId) {
    throw createError('IDEMPOTENCY_UNSAFE', 'Unable to resolve xpay settlement bucket', 409);
  }

  const insertResult = await client.query(
    `
INSERT INTO public.provider_settlement_items (
  provider_settlement_id,
  payment_id,
  provider_payment_id,
  booking_id,
  amount_gross,
  provider_fee,
  amount_net,
  currency,
  status,
  created_at
) VALUES (
  $1,
  $2,
  $3,
  $4,
  $5,
  0,
  $6,
  COALESCE($7, 'KGS'),
  'created',
  now()
)
ON CONFLICT (provider_settlement_id, payment_id) DO NOTHING
RETURNING id
    `,
    [
      providerSettlementId,
      paymentRow.id,
      paymentRow.qr_transaction_id || String(paymentRow.id),
      bookingRow.id,
      amount,
      amount,
      paymentRow.currency || 'KGS',
    ]
  );

  if (insertResult.rows[0]?.id) {
    return {
      ok: true,
      status: 'created',
      reason: null,
      provider_settlement_id: providerSettlementId,
      provider_settlement_item_id: insertResult.rows[0].id,
      inserted_count: 1,
    };
  }

  const existingAfterInsertResult = await client.query(
    `
SELECT psi.id, psi.provider_settlement_id
FROM public.provider_settlement_items psi
WHERE psi.provider_settlement_id = $1
  AND psi.payment_id = $2
LIMIT 1
    `,
    [providerSettlementId, paymentRow.id]
  );

  if (existingAfterInsertResult.rows[0]) {
    return {
      ok: true,
      status: 'exists',
      reason: 'PROVIDER_SETTLEMENT_ITEM_ALREADY_EXISTS',
      provider_settlement_id: existingAfterInsertResult.rows[0].provider_settlement_id,
      provider_settlement_item_id: existingAfterInsertResult.rows[0].id,
      inserted_count: 0,
    };
  }

  throw createError('PROVIDER_SETTLEMENT_CONTEXT_MISSING', 'Unable to materialize xpay settlement item', 409);
}

export {
  createProviderSettlementItemForXpayPayment,
};
