'use strict';

import { assertMoneyCoreWriteAllowed } from './config.js';

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeOptionalInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

const VALID_SPLIT_ROLES = new Set([
  'salon',
  'master',
  'platform',
  'provider_fee',
  'bank_fee',
]);

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

function safePagination(filters = {}) {
  const limit = Math.min(Math.max(Number.parseInt(filters.limit, 10) || 100, 1), 500);
  const offset = Math.max(Number.parseInt(filters.offset, 10) || 0, 0);
  return { limit, offset };
}

function buildTotals(allocations = []) {
  return allocations.reduce(
    (totals, allocation) => {
      totals.gross_amount += normalizeNumber(allocation.gross_amount, 0);
      totals.provider_fee_amount += normalizeNumber(allocation.provider_fee_amount, 0);
      totals.platform_fee_amount += normalizeNumber(allocation.platform_fee_amount, 0);
      totals.owner_net_amount += normalizeNumber(allocation.owner_net_amount, 0);
      return totals;
    },
    {
      gross_amount: 0,
      provider_fee_amount: 0,
      platform_fee_amount: 0,
      owner_net_amount: 0,
    }
  );
}

async function listSplitAllocations(pool, filters = {}) {
  const where = [];
  const values = [];
  let index = 1;

  if (filters.provider_settlement_id !== undefined && filters.provider_settlement_id !== null && filters.provider_settlement_id !== '') {
    where.push(`provider_settlement_id = $${index++}`);
    values.push(normalizeOptionalInteger(filters.provider_settlement_id));
  }

  if (filters.payment_id !== undefined && filters.payment_id !== null && filters.payment_id !== '') {
    where.push(`payment_id = $${index++}`);
    values.push(normalizeOptionalInteger(filters.payment_id));
  }

  if (filters.booking_id !== undefined && filters.booking_id !== null && filters.booking_id !== '') {
    where.push(`booking_id = $${index++}`);
    values.push(normalizeOptionalInteger(filters.booking_id));
  }

  if (filters.owner_type) {
    where.push(`owner_type = $${index++}`);
    values.push(normalizeText(filters.owner_type));
  }

  if (filters.owner_id !== undefined && filters.owner_id !== null && filters.owner_id !== '') {
    where.push(`owner_id = $${index++}`);
    values.push(normalizeOptionalInteger(filters.owner_id));
  }

  if (filters.status) {
    where.push(`status = $${index++}`);
    values.push(normalizeText(filters.status));
  }

  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index++;
  values.push(offset);
  const offsetIndex = index++;

  const result = await pool.query(
    `
    SELECT *
    FROM public.money_split_allocations
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

async function getSplitAllocationById(pool, id) {
  const allocationId = Number(id);
  if (!Number.isInteger(allocationId) || allocationId <= 0) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT *
    FROM public.money_split_allocations
    WHERE id = $1
    LIMIT 1
    `,
    [allocationId]
  );

  return result.rows[0] || null;
}

async function previewSettlementSplit(pool, settlementId, input = {}) {
  const resolvedSettlementId = Number(settlementId);
  if (!Number.isInteger(resolvedSettlementId) || resolvedSettlementId <= 0) {
    return null;
  }

  const settlementResult = await pool.query(
    `
    SELECT *
    FROM public.provider_settlements
    WHERE id = $1
    LIMIT 1
    `,
    [resolvedSettlementId]
  );

  const settlement = settlementResult.rows[0];
  if (!settlement) {
    return null;
  }

  const itemsResult = await pool.query(
    `
    SELECT *
    FROM public.provider_settlement_items
    WHERE provider_settlement_id = $1
    ORDER BY id ASC
    `,
    [resolvedSettlementId]
  );

  const items = itemsResult.rows;
  const warnings = [];

  if (!items.length) {
    warnings.push('NO_SETTLEMENT_ITEMS');
    return {
      ok: true,
      settlement,
      allocations: [],
      totals: {
        gross_amount: 0,
        provider_fee_amount: 0,
        platform_fee_amount: 0,
        owner_net_amount: 0,
      },
      warnings,
    };
  }

  const ownerType = normalizeText(input.owner_type);
  const ownerId = normalizeOptionalInteger(input.owner_id);
  const roleInSplit = normalizeText(input.role_in_split);

  const allocations = items.map((item) => {
    const grossAmount = normalizeNumber(item.amount_gross, 0);
    const providerFeeAmount = normalizeNumber(item.provider_fee, 0);
    const ownerNetAmount =
      item.amount_net !== null && item.amount_net !== undefined
        ? normalizeNumber(item.amount_net, 0)
        : grossAmount - providerFeeAmount;

    return {
      provider_settlement_id: resolvedSettlementId,
      payment_id: item.payment_id ?? null,
      booking_id: item.booking_id ?? null,
      owner_type: ownerType,
      owner_id: ownerId,
      role_in_split: roleInSplit,
      gross_amount: grossAmount,
      provider_fee_amount: providerFeeAmount,
      platform_fee_amount: 0,
      owner_net_amount: ownerNetAmount,
      currency: item.currency || settlement.currency || 'KGS',
      status: 'draft',
    };
  });

  if (!roleInSplit) {
    warnings.push('OWNER_SPLIT_ROLE_REQUIRED');
  } else if (!VALID_SPLIT_ROLES.has(roleInSplit)) {
    warnings.push('OWNER_SPLIT_ROLE_INVALID');
  }

  return {
    ok: true,
    settlement,
    allocations,
    totals: buildTotals(allocations),
    warnings,
  };
}

async function createSettlementSplitAllocations(pool, settlementId, input = {}, actor = {}) {
  assertMoneyCoreWriteAllowed();

  const resolvedSettlementId = Number(settlementId);
  if (!Number.isInteger(resolvedSettlementId) || resolvedSettlementId <= 0) {
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingResult = await client.query(
      `
      SELECT *
      FROM public.money_split_allocations
      WHERE provider_settlement_id = $1
      ORDER BY id ASC
      `,
      [resolvedSettlementId]
    );

    if (existingResult.rows.length) {
      await client.query('COMMIT');
      return {
        already_exists: true,
        settlement_id: resolvedSettlementId,
        allocations: existingResult.rows,
        totals: buildTotals(existingResult.rows),
      };
    }

    let allocationsInput = Array.isArray(input.allocations) ? input.allocations : null;

    if (!allocationsInput || !allocationsInput.length) {
      const preview = await previewSettlementSplit(client, resolvedSettlementId, input);
      if (!preview) {
        await client.query('ROLLBACK');
        return null;
      }

      allocationsInput = preview.allocations;
    }

    const preparedAllocations = allocationsInput.map((allocation) => ({
      provider_settlement_id: resolvedSettlementId,
      payment_id: allocation.payment_id ?? null,
      booking_id: allocation.booking_id ?? null,
      split_rule_id: allocation.split_rule_id ?? null,
      owner_type: normalizeText(allocation.owner_type),
      owner_id: normalizeOptionalInteger(allocation.owner_id),
      role_in_split: normalizeText(allocation.role_in_split),
      gross_amount: normalizeNumber(allocation.gross_amount, 0),
      provider_fee_amount: normalizeNumber(allocation.provider_fee_amount, 0),
      platform_fee_amount: normalizeNumber(allocation.platform_fee_amount, 0),
      owner_net_amount: normalizeNumber(allocation.owner_net_amount, 0),
      currency: normalizeText(allocation.currency) || 'KGS',
      status: normalizeText(allocation.status) || 'draft',
      ledger_group_id: allocation.ledger_group_id ?? null,
      metadata_json: sanitizeJson(allocation.metadata_json ?? allocation.metadata ?? {}),
      created_by_type: normalizeText(actor.user_type) || 'system',
      created_by_id: Number.isInteger(Number(actor.user_id)) ? Number(actor.user_id) : null,
    }));

    for (const allocation of preparedAllocations) {
      if (!allocation.owner_type || allocation.owner_id === null || allocation.owner_id === undefined || allocation.owner_id <= 0) {
        const error = new Error('Split allocation owner is required');
        error.code = 'SPLIT_ALLOCATION_OWNER_REQUIRED';
        error.statusCode = 400;
        throw error;
      }

      if (!allocation.role_in_split) {
        const error = new Error('Split allocation role is required');
        error.code = 'SPLIT_ALLOCATION_ROLE_REQUIRED';
        error.statusCode = 400;
        throw error;
      }

      if (!VALID_SPLIT_ROLES.has(allocation.role_in_split)) {
        const error = new Error('Split allocation role is invalid');
        error.code = 'SPLIT_ALLOCATION_ROLE_INVALID';
        error.statusCode = 400;
        throw error;
      }
    }

    const insertedRows = [];
    for (const allocation of preparedAllocations) {
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
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14,
          now(),
          now()
        )
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
        ]
      );

      insertedRows.push(insertResult.rows[0]);
    }

    await client.query('COMMIT');

    return {
      already_exists: false,
      settlement_id: resolvedSettlementId,
      allocations: insertedRows,
      totals: buildTotals(insertedRows),
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback failure
    }
    throw error;
  } finally {
    client.release();
  }
}

export {
  listSplitAllocations,
  getSplitAllocationById,
  previewSettlementSplit,
  createSettlementSplitAllocations,
};
