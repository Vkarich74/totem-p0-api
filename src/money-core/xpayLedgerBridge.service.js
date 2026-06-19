'use strict';

import { randomUUID } from 'node:crypto';
import { getMoneyCoreFlags } from './config.js';
import { rebuildOwnerBalanceFromLedger } from './ledger.service.js';

const ALLOWED_OWNER_TYPES = new Set(['salon', 'master', 'platform']);
const ALLOWED_ROLE_IN_SPLIT = new Set(['salon', 'master', 'platform']);
const ALLOWED_LEDGER_SPLIT_STATUSES = new Set(['draft', 'allocated', 'pending_settlement']);

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

function normalizeOwnerId(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
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
      const lowered = String(key || '').trim().toLowerCase();
      if (['secret', 'token', 'password', 'authorization', 'signature'].includes(lowered)) {
        continue;
      }
      output[key] = sanitizeJson(childValue);
    }
    return output;
  }

  return value;
}

function createError(code, message, statusCode = 500) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function buildBridgeMetadata({
  route,
  reason,
  settlementRow,
  itemRow,
  allocationRow,
}) {
  return sanitizeJson({
    source: 'c20_j_xpay_ledger_bridge',
    route,
    reason,
    provider_code: 'xpay',
    provider_settlement_id: Number(settlementRow.id),
    settlement_source: normalizeText(settlementRow.settlement_source),
    settlement_status: normalizeText(settlementRow.status),
    payment_id: Number(allocationRow.payment_id),
    booking_id: Number(allocationRow.booking_id),
    provider_settlement_item_id: itemRow ? Number(itemRow.id) : null,
    split_allocation_id: Number(allocationRow.id),
    owner_type: normalizeText(allocationRow.owner_type),
    owner_id: normalizeOwnerId(allocationRow.owner_id),
    role_in_split: normalizeText(allocationRow.role_in_split),
    owner_net_amount: normalizeAmount(allocationRow.owner_net_amount),
    gross_amount: normalizeAmount(allocationRow.gross_amount),
    currency: normalizeText(allocationRow.currency) || 'KGS',
  });
}

async function loadXpayBridgeContext(client, providerSettlementId) {
  const settlementResult = await client.query(
    `
SELECT
  ps.id,
  ps.provider_code,
  ps.settlement_source,
  ps.provider_settlement_id,
  ps.status,
  ps.amount_gross,
  ps.amount_fee,
  ps.amount_net,
  ps.currency,
  ps.bank_received_at,
  ps.manual_confirmed_by,
  ps.manual_confirmed_at,
  ps.created_at,
  ps.updated_at
FROM public.provider_settlements ps
WHERE ps.id = $1
LIMIT 1
    `,
    [providerSettlementId]
  );

  const settlementRow = settlementResult.rows[0] || null;
  if (!settlementRow) {
    throw createError('PROVIDER_SETTLEMENT_NOT_FOUND', 'Provider settlement not found', 404);
  }

  const itemsResult = await client.query(
    `
SELECT
  psi.id,
  psi.provider_settlement_id,
  psi.payment_id,
  psi.provider_payment_id,
  psi.booking_id,
  psi.amount_gross,
  psi.provider_fee,
  psi.amount_net,
  psi.currency,
  psi.status,
  psi.created_at
FROM public.provider_settlement_items psi
WHERE psi.provider_settlement_id = $1
ORDER BY psi.id ASC
    `,
    [providerSettlementId]
  );

  const allocationsResult = await client.query(
    `
SELECT
  msa.id,
  msa.payment_id,
  msa.booking_id,
  msa.provider_settlement_id,
  msa.owner_type,
  msa.owner_id,
  msa.role_in_split,
  msa.gross_amount,
  msa.provider_fee_amount,
  msa.platform_fee_amount,
  msa.owner_net_amount,
  msa.currency,
  msa.status,
  msa.ledger_group_id,
  msa.created_at,
  msa.updated_at
FROM public.money_split_allocations msa
WHERE msa.provider_settlement_id = $1
ORDER BY msa.id ASC
    `,
    [providerSettlementId]
  );

  return {
    settlementRow,
    itemRows: itemsResult.rows || [],
    allocationRows: allocationsResult.rows || [],
  };
}

async function createLedgerEntriesForXpaySettlement(client, input = {}) {
  if (!client || typeof client.query !== 'function') {
    throw createError('MONEY_CORE_DB_CLIENT_REQUIRED', 'Database client is required', 500);
  }

  const providerSettlementId = normalizePositiveInt(input.providerSettlementId ?? input.provider_settlement_id);
  if (!providerSettlementId) {
    throw createError('PROVIDER_SETTLEMENT_ID_INVALID', 'providerSettlementId is required', 400);
  }

  const flags = getMoneyCoreFlags();
  if (
    !flags.MONEY_CORE_ENABLED ||
    flags.MONEY_CORE_READ_ONLY ||
    !flags.MONEY_CORE_WRITE_ENABLED ||
    !flags.MONEY_CORE_LEDGER_MOVEMENTS_ENABLED
  ) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'LEDGER_MOVEMENTS_DISABLED',
      provider_settlement_id: providerSettlementId,
      ledger_inserted_count: 0,
      ledger_existing_count: 0,
      owners_rebuilt_count: 0,
    };
  }

  const { settlementRow, itemRows, allocationRows } = await loadXpayBridgeContext(client, providerSettlementId);

  if (normalizeText(settlementRow.provider_code) !== 'xpay') {
    return {
      ok: true,
      status: 'skipped',
      reason: 'NOT_XPAY_SETTLEMENT',
      provider_settlement_id: providerSettlementId,
      ledger_inserted_count: 0,
      ledger_existing_count: 0,
      owners_rebuilt_count: 0,
    };
  }

  if (normalizeText(settlementRow.status) !== 'bank_received') {
    return {
      ok: true,
      status: 'skipped',
      reason: 'SETTLEMENT_NOT_READY',
      provider_settlement_id: providerSettlementId,
      ledger_inserted_count: 0,
      ledger_existing_count: 0,
      owners_rebuilt_count: 0,
    };
  }

  if (!itemRows.length) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'NO_SETTLEMENT_ITEMS',
      provider_settlement_id: providerSettlementId,
      ledger_inserted_count: 0,
      ledger_existing_count: 0,
      owners_rebuilt_count: 0,
    };
  }

  const validItemPaymentIds = new Set(
    itemRows
      .map((row) => normalizePositiveInt(row.payment_id))
      .filter((value) => value !== null)
  );

  const eligibleAllocations = allocationRows.filter((row) => {
    const ownerNetAmount = normalizeAmount(row.owner_net_amount);
    const currency = normalizeText(row.currency) || 'KGS';
    const status = normalizeText(row.status);
    return (
      ownerNetAmount !== null &&
      ownerNetAmount > 0 &&
      currency === 'KGS' &&
      ALLOWED_OWNER_TYPES.has(normalizeText(row.owner_type) || '') &&
      ALLOWED_ROLE_IN_SPLIT.has(normalizeText(row.role_in_split) || '') &&
      ALLOWED_LEDGER_SPLIT_STATUSES.has(status)
    );
  });

  if (!eligibleAllocations.length) {
    return {
      ok: true,
      status: 'skipped',
      reason: 'NO_LEDGER_AMOUNT_DUE',
      provider_settlement_id: providerSettlementId,
      ledger_inserted_count: 0,
      ledger_existing_count: 0,
      owners_rebuilt_count: 0,
    };
  }

  for (const allocation of eligibleAllocations) {
    const allocationPaymentId = normalizePositiveInt(allocation.payment_id);
    const allocationOwnerId = normalizeOwnerId(allocation.owner_id);
    if (!allocationPaymentId || !validItemPaymentIds.has(allocationPaymentId)) {
      throw createError('INVALID_SPLIT_ALLOCATION', 'Split allocation payment is invalid', 409);
    }

    if (allocationOwnerId === null) {
      throw createError('INVALID_SPLIT_ALLOCATION', 'Split allocation owner is invalid', 409);
    }

    if (!ALLOWED_OWNER_TYPES.has(normalizeText(allocation.owner_type) || '')) {
      throw createError('INVALID_SPLIT_ALLOCATION', 'Split allocation owner type is invalid', 409);
    }

    if (!ALLOWED_ROLE_IN_SPLIT.has(normalizeText(allocation.role_in_split) || '')) {
      throw createError('INVALID_SPLIT_ALLOCATION', 'Split allocation role is invalid', 409);
    }

    if ((normalizeText(allocation.currency) || 'KGS') !== 'KGS') {
      throw createError('INVALID_SPLIT_ALLOCATION', 'Split allocation currency is invalid', 409);
    }
  }

  const entryGroupId = randomUUID();
  const insertedRows = [];
  const candidateSourceIds = [];

  for (const allocation of eligibleAllocations) {
    const metadata = buildBridgeMetadata({
      route: normalizeText(input.route) || '/money-core/settlements/:id/confirm-bank-received',
      reason: normalizeText(input.reason) || 'xpay_provider_settlement_available',
      settlementRow,
      itemRow: itemRows.find((item) => normalizePositiveInt(item.payment_id) === normalizePositiveInt(allocation.payment_id)) || null,
      allocationRow: allocation,
    });

    candidateSourceIds.push(normalizePositiveInt(allocation.id));

    const insertResult = await client.query(
      `
INSERT INTO public.money_ledger_entries (
  entry_group_id,
  owner_type,
  owner_id,
  money_zone,
  direction,
  amount,
  currency,
  source_type,
  source_id,
  reason,
  provider_code,
  created_by_type,
  created_by_id,
  metadata_json,
  created_at
) VALUES (
  $1::uuid,
  $2,
  $3,
  'available',
  'credit',
  $4,
  'KGS',
  'xpay_split_allocation',
  $5,
  $6,
  'xpay',
  $7,
  $8,
  $9::jsonb,
  now()
)
ON CONFLICT DO NOTHING
RETURNING id
      `,
      [
        entryGroupId,
        normalizeText(allocation.owner_type),
        allocationOwnerId,
        normalizeAmount(allocation.owner_net_amount),
        normalizePositiveInt(allocation.id),
        normalizeText(input.reason) || 'xpay_provider_settlement_available',
        normalizeText(input.actor?.user_type) || 'system',
        Number.isInteger(Number(input.actor?.user_id)) && Number(input.actor?.user_id) > 0 ? Number(input.actor.user_id) : null,
        JSON.stringify(metadata),
      ]
    );

    if (insertResult.rows[0]) {
      insertedRows.push({
        source_id: normalizePositiveInt(allocation.id),
        owner_type: normalizeText(allocation.owner_type),
        owner_id: allocationOwnerId,
        currency: 'KGS',
      });
    }
  }

  const touchedOwners = [];
  for (const allocation of eligibleAllocations) {
    const ownerType = normalizeText(allocation.owner_type);
    const ownerId = normalizeOwnerId(allocation.owner_id);
    const key = `${ownerType}:${ownerId}:KGS`;
    if (!touchedOwners.some((item) => item.key === key)) {
      touchedOwners.push({
        key,
        owner_type: ownerType,
        owner_id: ownerId,
        currency: 'KGS',
      });
    }
  }

  const rebuiltBalances = [];
  for (const owner of touchedOwners) {
    const balance = await rebuildOwnerBalanceFromLedger(
      client,
      owner.owner_type,
      owner.owner_id,
      owner.currency,
      {
        user_type: normalizeText(input.actor?.user_type) || 'system',
        user_id: Number.isInteger(Number(input.actor?.user_id)) && Number(input.actor?.user_id) > 0 ? Number(input.actor.user_id) : null,
      }
    );
    rebuiltBalances.push(balance);
  }

  const existingCount = Math.max(candidateSourceIds.length - insertedRows.length, 0);

  return {
    ok: true,
    status: insertedRows.length ? 'created' : 'exists',
    reason: insertedRows.length ? null : 'LEDGER_ALREADY_EXISTS',
    provider_settlement_id: providerSettlementId,
    ledger_inserted_count: insertedRows.length,
    ledger_existing_count: existingCount,
    owners_rebuilt_count: rebuiltBalances.length,
  };
}

export {
  createLedgerEntriesForXpaySettlement,
};
