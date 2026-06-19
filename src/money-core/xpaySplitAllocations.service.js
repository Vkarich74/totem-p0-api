'use strict';

import { computePaymentShareBreakdown } from './paymentProjectionMath.js';

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

function buildSettlementKey(paymentId) {
  return `xpay:payment:${paymentId}`;
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

function toAllocationRows({ paymentRow, bookingRow, shares, settlementId, input = {} }) {
  const currency = normalizeText(paymentRow.currency) || normalizeText(shares.currency) || 'KGS';
  const rows = [];

  const sharedMetadata = sanitizeJson({
    source: 'c20_i_xpay_split_allocation_bridge',
    payment_id: Number(paymentRow.id),
    booking_id: Number(bookingRow.id),
    provider_settlement_id: Number(settlementId),
    provider_settlement_key: `xpay:payment:${Number(paymentRow.id)}`,
    provider: 'xpay',
    route: normalizeText(input.route) || '/payments/xpay/status',
    shares: {
      master_share: normalizeAmount(shares.master_share) || 0,
      salon_share: normalizeAmount(shares.salon_share) || 0,
      platform_share: normalizeAmount(shares.platform_share) || 0,
      share_residual: normalizeAmount(shares.share_residual) || 0,
    },
    actor: {
      type: normalizeText(input.actor?.type) || normalizeText(input.actor?.user_type) || 'system',
      user_id: Number.isInteger(Number(input.actor?.user_id)) ? Number(input.actor.user_id) : null,
    },
  });

  const pushRow = (ownerType, ownerId, roleInSplit, amount) => {
    const grossAmount = normalizeAmount(amount) || 0;
    if (grossAmount <= 0) {
      return;
    }

    rows.push({
      payment_id: Number(paymentRow.id),
      booking_id: Number(bookingRow.id),
      provider_settlement_id: Number(settlementId),
      split_rule_id: null,
      owner_type: ownerType,
      owner_id: ownerId,
      role_in_split: roleInSplit,
      gross_amount: grossAmount,
      provider_fee_amount: 0,
      platform_fee_amount: 0,
      owner_net_amount: grossAmount,
      currency,
      status: 'draft',
      ledger_group_id: null,
      created_by_type: 'system',
      created_by_id: null,
      metadata_json: sharedMetadata,
    });
  };

  pushRow('salon', Number(bookingRow.salon_id), 'salon', shares.salon_share);
  pushRow('master', Number(bookingRow.master_id), 'master', shares.master_share);

  const platformAmount = (normalizeAmount(shares.platform_share) || 0) + (normalizeAmount(shares.share_residual) || 0);
  if (platformAmount > 0) {
    pushRow('platform', 0, 'platform', platformAmount);
  }

  return rows;
}

async function createXpaySplitAllocationsForPayment(client, input = {}) {
  if (!client || typeof client.query !== 'function') {
    throw createError('MONEY_CORE_DB_CLIENT_REQUIRED', 'Database client is required', 500);
  }

  const paymentId = normalizePositiveInt(input.paymentId ?? input.payment_id);
  if (!paymentId) {
    throw createError('PAYMENT_ID_INVALID', 'paymentId is required', 400);
  }

  const settlementKey = buildSettlementKey(paymentId);

  const contextResult = await client.query(
    `
SELECT
  p.id,
  p.booking_id,
  p.provider,
  p.status,
  p.amount,
  p.currency,
  p.collector_owner_type,
  p.collector_owner_id,
  p.confirmed_at,
  p.created_at AS payment_created_at,
  b.id AS booking_row_id,
  b.salon_id,
  b.master_id,
  b.status AS booking_status,
  b.start_at AS booking_start_at,
  b.start_at AS booking_datetime_start,
  b.created_at AS booking_created_at,
  ps.id AS provider_settlement_row_id,
  ps.provider_code,
  ps.provider_settlement_id AS provider_settlement_key,
  psi.id AS provider_settlement_item_id
FROM public.payments p
JOIN public.bookings b ON b.id = p.booking_id
JOIN public.provider_settlements ps
  ON ps.provider_code = 'xpay'
 AND ps.provider_settlement_id = $2
JOIN public.provider_settlement_items psi
  ON psi.provider_settlement_id = ps.id
 AND psi.payment_id = p.id
WHERE p.id = $1
FOR UPDATE OF p, b, ps, psi
LIMIT 1
    `,
    [paymentId, settlementKey]
  );

  const row = contextResult.rows[0];
  if (!row) {
    throw createError('XPAY_SPLIT_CONTEXT_MISSING', 'xpay settlement context is missing', 409);
  }

  const expectedProviderSettlementId = normalizePositiveInt(
    input.providerSettlementId ?? input.provider_settlement_id
  );
  if (
    expectedProviderSettlementId &&
    expectedProviderSettlementId !== Number(row.provider_settlement_row_id)
  ) {
    throw createError('XPAY_SPLIT_SETTLEMENT_MISMATCH', 'xpay settlement id mismatch', 409);
  }

  const paymentRow = {
    id: Number(row.id),
    booking_id: Number(row.booking_id),
    provider: row.provider,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    confirmed_at: row.confirmed_at,
    payment_created_at: row.payment_created_at,
    collector_owner_type: row.collector_owner_type,
    collector_owner_id: row.collector_owner_id,
  };

  const bookingRow = {
    id: Number(row.booking_row_id),
    salon_id: normalizePositiveInt(row.salon_id),
    master_id: normalizePositiveInt(row.master_id),
    status: row.booking_status,
    start_at: row.booking_start_at,
    datetime_start: row.booking_datetime_start,
    created_at: row.booking_created_at,
  };

  if (String(paymentRow.provider || '').trim().toLowerCase() !== 'xpay') {
    return {
      ok: true,
      status: 'skipped',
      reason: 'NOT_XPAY_PAYMENT',
      provider_settlement_id: Number(row.provider_settlement_row_id),
      inserted_count: 0,
      allocations: [],
    };
  }

  if (String(paymentRow.status || '').trim().toLowerCase() !== 'confirmed') {
    return {
      ok: true,
      status: 'skipped',
      reason: 'NOT_CONFIRMED_PAYMENT',
      provider_settlement_id: Number(row.provider_settlement_row_id),
      inserted_count: 0,
      allocations: [],
    };
  }

  const amount = normalizeAmount(paymentRow.amount);
  if (amount === null || amount <= 0) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'NO_AMOUNT_DUE',
      provider_settlement_id: Number(row.provider_settlement_row_id),
      inserted_count: 0,
      allocations: [],
    };
  }

  const bookingStatus = String(bookingRow.status || '').trim().toLowerCase();
  if (['cancelled', 'canceled', 'rejected', 'failed', 'refunded'].includes(bookingStatus)) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'BOOKING_CANCELLED',
      provider_settlement_id: Number(row.provider_settlement_row_id),
      inserted_count: 0,
      allocations: [],
    };
  }

  if (!bookingRow.salon_id || !bookingRow.master_id) {
    throw createError('MISSING_SALON_OR_MASTER', 'Booking must have salon and master', 409);
  }

  const contract = await loadApplicableContract(client, paymentRow, bookingRow);
  if (!contract) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'CONTRACT_MISSING',
      provider_settlement_id: Number(row.provider_settlement_row_id),
      inserted_count: 0,
      allocations: [],
    };
  }

  const shares = computePaymentShareBreakdown({
    payment: {
      id: paymentRow.id,
      amount: paymentRow.amount,
      currency: paymentRow.currency,
      provider: paymentRow.provider,
      payment_status: paymentRow.status,
      booking_status: bookingRow.status,
      confirmed_at: paymentRow.confirmed_at,
      created_at: paymentRow.payment_created_at,
      collector_owner_type: paymentRow.collector_owner_type,
      collector_owner_id: paymentRow.collector_owner_id,
      salon_id: bookingRow.salon_id,
      master_id: bookingRow.master_id,
    },
    booking: bookingRow,
    contract,
  });

  const providerSettlementId = Number(row.provider_settlement_row_id);
  if (!Number.isInteger(providerSettlementId) || providerSettlementId <= 0) {
    throw createError('XPAY_SPLIT_SETTLEMENT_ID_INVALID', 'xpay settlement id is invalid', 409);
  }

  const allocationsToInsert = toAllocationRows({
    paymentRow,
    bookingRow,
    shares,
    settlementId: providerSettlementId,
    input,
  });

  if (!allocationsToInsert.length) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'NO_SPLIT_DUE',
      provider_settlement_id: providerSettlementId,
      inserted_count: 0,
      allocations: [],
    };
  }

  const insertedRows = [];
  for (const allocation of allocationsToInsert) {
    const insertResult = await client.query(
      `
INSERT INTO public.money_split_allocations (
  payment_id,
  booking_id,
  provider_settlement_id,
  split_rule_id,
  owner_type,
  owner_id,
  role_in_split,
  gross_amount,
  provider_fee_amount,
  platform_fee_amount,
  owner_net_amount,
  currency,
  status,
  ledger_group_id,
  created_by_type,
  created_by_id,
  metadata_json,
  created_at,
  updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7,
  $8, $9, $10, $11, $12, $13, $14,
  $15, $16, $17::jsonb,
  now(),
  now()
)
ON CONFLICT (
  provider_settlement_id,
  payment_id,
  owner_type,
  owner_id,
  role_in_split
) DO NOTHING
RETURNING *
      `,
      [
        allocation.payment_id,
        allocation.booking_id,
        allocation.provider_settlement_id,
        allocation.split_rule_id,
        allocation.owner_type,
        allocation.owner_id,
        allocation.role_in_split,
        allocation.gross_amount,
        allocation.provider_fee_amount,
        allocation.platform_fee_amount,
        allocation.owner_net_amount,
        allocation.currency,
        allocation.status,
        allocation.ledger_group_id,
        allocation.created_by_type,
        allocation.created_by_id,
        JSON.stringify(allocation.metadata_json || {}),
      ]
    );

    if (insertResult.rows[0]) {
      insertedRows.push(insertResult.rows[0]);
    }
  }

  if (insertedRows.length) {
    return {
      ok: true,
      status: 'created',
      reason: null,
      provider_settlement_id: providerSettlementId,
      inserted_count: insertedRows.length,
      allocations: insertedRows,
    };
  }

  const existingResult = await client.query(
    `
SELECT *
FROM public.money_split_allocations
WHERE provider_settlement_id = $1
  AND payment_id = $2
ORDER BY id ASC
    `,
    [providerSettlementId, paymentId]
  );

  return {
    ok: true,
    status: 'exists',
    reason: 'SPLIT_ALLOCATIONS_ALREADY_EXISTS',
    provider_settlement_id: providerSettlementId,
    inserted_count: 0,
    allocations: existingResult.rows,
  };
}

export {
  createXpaySplitAllocationsForPayment,
};
