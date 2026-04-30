'use strict';

import { randomUUID } from 'crypto';
import { assertMoneyCoreWriteAllowed } from './config.js';

const ALLOWED_OWNER_TYPES = new Set(['salon', 'master', 'platform', 'system']);
const ALLOWED_CREATION_MODES = new Set(['manual', 'scheduled', 'admin', 'system']);
const ALLOWED_REQUEST_STATUSES = new Set([
  'created',
  'pending_validation',
  'requires_review',
  'locked',
  'queued_for_payout',
  'bank_processing',
  'completed',
  'failed',
  'rejected',
  'canceled',
]);

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeInt(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function safePagination(filters = {}) {
  const limit = Math.min(Math.max(Number.parseInt(filters.limit, 10) || 100, 1), 500);
  const offset = Math.max(Number.parseInt(filters.offset, 10) || 0, 0);
  return { limit, offset };
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

function buildBalanceFromLedgerRows(rows = []) {
  const balance = {
    provider_hold: 0,
    pending_settlement: 0,
    available: 0,
    locked: 0,
    paid_out: 0,
    refunded: 0,
    reversed: 0,
    fee_reserved: 0,
    commission: 0,
    requires_review: 0,
  };

  for (const row of rows) {
    if (!Object.prototype.hasOwnProperty.call(balance, row.money_zone)) {
      continue;
    }

    const delta = row.direction === 'credit' ? Number(row.amount) : -Number(row.amount);
    balance[row.money_zone] += delta;
  }

  return balance;
}

function validateOwner(ownerType, ownerId) {
  const normalizedOwnerType = normalizeText(ownerType);
  const normalizedOwnerId = normalizeInt(ownerId);

  if (!normalizedOwnerType || !ALLOWED_OWNER_TYPES.has(normalizedOwnerType)) {
    const error = new Error('Invalid owner_type');
    error.code = 'WITHDRAW_REQUEST_OWNER_TYPE_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!normalizedOwnerId || normalizedOwnerId <= 0) {
    const error = new Error('Invalid owner_id');
    error.code = 'WITHDRAW_REQUEST_OWNER_ID_INVALID';
    error.statusCode = 400;
    throw error;
  }

  return { owner_type: normalizedOwnerType, owner_id: normalizedOwnerId };
}

async function listWithdrawRequests(pool, ownerType, ownerId, filters = {}) {
  const owner = validateOwner(ownerType, ownerId);
  const where = ['owner_type = $1', 'owner_id = $2'];
  const values = [owner.owner_type, owner.owner_id];
  let index = 3;

  if (filters.status) {
    where.push(`status = $${index++}`);
    values.push(normalizeText(filters.status));
  }

  if (filters.destination_id !== undefined && filters.destination_id !== null && filters.destination_id !== '') {
    where.push(`destination_id = $${index++}`);
    values.push(normalizeInt(filters.destination_id));
  }

  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index++;
  values.push(offset);
  const offsetIndex = index++;

  const result = await pool.query(
    `
    SELECT *
    FROM public.withdraw_requests
    WHERE ${where.join(' AND ')}
    ORDER BY id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

async function getWithdrawRequestById(pool, id) {
  const requestId = normalizeInt(id);
  if (!requestId || requestId <= 0) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT *
    FROM public.withdraw_requests
    WHERE id = $1
    LIMIT 1
    `,
    [requestId]
  );

  return result.rows[0] || null;
}

async function createWithdrawRequest(pool, ownerType, ownerId, input = {}, actor = {}) {
  assertMoneyCoreWriteAllowed();

  const owner = validateOwner(ownerType, ownerId);
  const amount = normalizeNumber(input.amount);
  const currency = normalizeText(input.currency) || 'KGS';
  const creationMode = normalizeText(input.creation_mode) || 'manual';
  const idempotencyKey = normalizeText(input.idempotency_key);
  const destinationId = normalizeInt(input.destination_id);

  if (currency !== 'KGS') {
    const error = new Error('Invalid currency');
    error.code = 'WITHDRAW_REQUEST_CURRENCY_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!amount || amount <= 0) {
    const error = new Error('amount must be greater than 0');
    error.code = 'WITHDRAW_REQUEST_AMOUNT_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!ALLOWED_CREATION_MODES.has(creationMode)) {
    const error = new Error('Invalid creation_mode');
    error.code = 'WITHDRAW_REQUEST_CREATION_MODE_INVALID';
    error.statusCode = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (idempotencyKey) {
      const existingResult = await client.query(
        `
        SELECT *
        FROM public.withdraw_requests
        WHERE idempotency_key = $1
        LIMIT 1
        `,
        [idempotencyKey]
      );

      if (existingResult.rows[0]) {
        await client.query('COMMIT');
        return {
          already_exists: true,
          request: existingResult.rows[0],
          ledger: null,
        };
      }
    }

    let resolvedDestinationId = null;
    if (destinationId !== null) {
      const destinationResult = await client.query(
        `
        SELECT id, owner_type, owner_id, status
        FROM public.withdraw_destinations
        WHERE id = $1
        LIMIT 1
        `,
        [destinationId]
      );

      const destination = destinationResult.rows[0];
      if (
        !destination ||
        destination.owner_type !== owner.owner_type ||
        Number(destination.owner_id) !== owner.owner_id ||
        ['archived', 'blocked'].includes(String(destination.status || '').trim().toLowerCase())
      ) {
        const error = new Error('Invalid withdraw destination');
        error.code = 'WITHDRAW_REQUEST_DESTINATION_INVALID';
        error.statusCode = 400;
        throw error;
      }

      resolvedDestinationId = destination.id;
    }

    const availableBalanceResult = await client.query(
      `
      SELECT available
      FROM public.money_owner_balances
      WHERE owner_type = $1
        AND owner_id = $2
        AND currency = 'KGS'
      LIMIT 1
      `,
      [owner.owner_type, owner.owner_id]
    );

    const availableSnapshot = balanceResult.rows[0] ? Number(balanceResult.rows[0].available) : 0;

    if (amount > availableSnapshot) {
      const error = new Error('Insufficient available balance');
      error.code = 'INSUFFICIENT_AVAILABLE_BALANCE';
      error.statusCode = 400;
      throw error;
    }

    const requestInsert = await client.query(
      `
      INSERT INTO public.withdraw_requests (
        legacy_withdraw_id,
        owner_type,
        owner_id,
        amount,
        currency,
        status,
        creation_mode,
        decision,
        risk_level,
        decision_reasons,
        destination_id,
        available_snapshot,
        locked_amount,
        locked_ledger_group_id,
        payout_execution_id,
        expected_payout_date,
        idempotency_key,
        rules_version,
        created_by_type,
        created_by_id,
        created_at,
        updated_at,
        locked_at,
        completed_at,
        failed_at,
        canceled_at,
        rejected_at,
        failure_reason,
        admin_note
      ) VALUES (
        NULL,
        $1,
        $2,
        $3,
        'KGS',
        'pending_validation',
        $4,
        'auto_approve',
        'green',
        '[]'::jsonb,
        $5,
        $6,
        0,
        NULL,
        NULL,
        NULL,
        $7,
        NULL,
        $8,
        $9,
        now(),
        now(),
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL
      )
      RETURNING *
      `,
      [
        owner.owner_type,
        owner.owner_id,
        amount,
        creationMode,
        resolvedDestinationId,
        availableSnapshot,
        idempotencyKey,
        normalizeText(input.created_by_type) || 'owner',
        normalizeInt(input.created_by_id),
      ]
    );

    const request = requestInsert.rows[0];

    const entryGroupId = request.locked_ledger_group_id || randomUUID();
    const sanitizedMetadata = sanitizeJson(input.metadata_json ?? input.metadata ?? {});

    const ledgerEntries = [];
    for (const entry of [
      {
        owner_type: owner.owner_type,
        owner_id: owner.owner_id,
        money_zone: 'available',
        direction: 'debit',
        amount,
      },
      {
        owner_type: owner.owner_type,
        owner_id: owner.owner_id,
        money_zone: 'locked',
        direction: 'credit',
        amount,
      },
    ]) {
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
          $4,
          $5,
          $6,
          'KGS',
          'withdraw_request',
          $7,
          $8,
          $9,
          $10,
          $11,
          $12::jsonb,
          now()
        )
        RETURNING *
        `,
        [
          entryGroupId,
          entry.owner_type,
          entry.owner_id,
          entry.money_zone,
          entry.direction,
          entry.amount,
          request.id,
          entry.money_zone === 'available' ? 'withdraw lock available' : 'withdraw lock locked',
          null,
          normalizeText(input.created_by_type) || 'owner',
          normalizeInt(input.created_by_id),
          JSON.stringify(sanitizedMetadata),
        ]
      );

      ledgerEntries.push(insertResult.rows[0]);
    }

    const ledgerRowsResult = await client.query(
      `
      SELECT money_zone, direction, amount
      FROM public.money_ledger_entries
      WHERE owner_type = $1
        AND owner_id = $2
        AND currency = 'KGS'
      ORDER BY id ASC
      `,
      [owner.owner_type, owner.owner_id]
    );

    const balance = buildBalanceFromLedgerRows(ledgerRowsResult.rows);
    for (const [zone, value] of Object.entries(balance)) {
      if (value < 0) {
        const error = new Error('Money owner balance cannot be negative');
        error.code = 'MONEY_OWNER_BALANCE_NEGATIVE';
        error.statusCode = 409;
        throw error;
      }
    }

    const balanceUpsertResult = await client.query(
      `
      INSERT INTO public.money_owner_balances (
        owner_type,
        owner_id,
        currency,
        provider_hold,
        pending_settlement,
        available,
        locked,
        paid_out,
        refunded,
        reversed,
        fee_reserved,
        commission,
        requires_review,
        updated_at
      ) VALUES (
        $1, $2, 'KGS', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now()
      )
      ON CONFLICT (owner_type, owner_id, currency)
      DO UPDATE SET
        provider_hold = EXCLUDED.provider_hold,
        pending_settlement = EXCLUDED.pending_settlement,
        available = EXCLUDED.available,
        locked = EXCLUDED.locked,
        paid_out = EXCLUDED.paid_out,
        refunded = EXCLUDED.refunded,
        reversed = EXCLUDED.reversed,
        fee_reserved = EXCLUDED.fee_reserved,
        commission = EXCLUDED.commission,
        requires_review = EXCLUDED.requires_review,
        updated_at = now()
      RETURNING *
      `,
      [
        owner.owner_type,
        owner.owner_id,
        balance.provider_hold,
        balance.pending_settlement,
        balance.available,
        balance.locked,
        balance.paid_out,
        balance.refunded,
        balance.reversed,
        balance.fee_reserved,
        balance.commission,
        balance.requires_review,
      ]
    );

    const updatedRequestResult = await client.query(
      `
      UPDATE public.withdraw_requests
      SET
        status = 'locked',
        locked_amount = $2,
        locked_ledger_group_id = $3::uuid,
        locked_at = now(),
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [
        request.id,
        amount,
        entryGroupId,
      ]
    );

    await client.query('COMMIT');

    return {
      request: updatedRequestResult.rows[0] || request,
      ledger: {
        entry_group_id: entryGroupId,
        entries: ledgerEntries,
        balances: [balanceUpsertResult.rows[0]],
      },
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
  listWithdrawRequests,
  getWithdrawRequestById,
  createWithdrawRequest,
};
