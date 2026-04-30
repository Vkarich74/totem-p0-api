'use strict';

import { randomUUID } from 'crypto';
import { assertMoneyCoreWriteAllowed } from './config.js';

const ALLOWED_PAYOUT_STATUSES = new Set([
  'draft',
  'submitted',
  'processing',
  'completed',
  'failed',
  'requires_review',
  'canceled',
]);

const ALLOWED_PAYOUT_MODES = new Set([
  'bank_api',
  'bank_registry',
  'manual',
  'future_provider',
]);

const ALLOWED_WITHDRAW_STATUSES_FOR_CREATE = new Set([
  'locked',
  'queued_for_payout',
]);

const ALLOWED_WITHDRAW_STATUSES_FOR_UPDATE = new Set([
  'bank_processing',
  'completed',
  'failed',
]);

const ALLOWED_SUBMIT_STATUSES = new Set(['draft', 'requires_review']);
const ALLOWED_COMPLETE_STATUSES = new Set(['submitted', 'processing']);
const ALLOWED_FAIL_STATUSES = new Set(['submitted', 'processing', 'requires_review']);
const TERMINAL_PAYOUT_STATUSES = new Set(['completed', 'failed', 'canceled']);

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

function validatePayoutStatus(status) {
  const normalized = normalizeText(status);
  if (!normalized || !ALLOWED_PAYOUT_STATUSES.has(normalized)) {
    const error = new Error('Invalid payout status');
    error.code = 'PAYOUT_STATUS_INVALID';
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

async function loadWithdrawRequest(pool, withdrawRequestId) {
  const result = await pool.query(
    `
    SELECT *
    FROM public.withdraw_requests
    WHERE id = $1
    LIMIT 1
    `,
    [withdrawRequestId]
  );
  return result.rows[0] || null;
}

async function loadPayout(pool, payoutId) {
  const result = await pool.query(
    `
    SELECT *
    FROM public.payout_executions
    WHERE id = $1
    LIMIT 1
    `,
    [payoutId]
  );
  return result.rows[0] || null;
}

async function insertLedgerEntriesAndRebuildBalance(
  client,
  ownerType,
  ownerId,
  amount,
  fromZone,
  toZone,
  sourceType,
  sourceId,
  metadata,
  actor
) {
  const entryGroupId = randomUUID();
  const sanitizedMetadata = sanitizeJson(metadata ?? {});
  const createdByType = normalizeText(actor?.user_type) || 'system';
  const createdById = normalizeInt(actor?.user_id);

  const entries = [];

  for (const entry of [
    { money_zone: fromZone, direction: 'debit' },
    { money_zone: toZone, direction: 'credit' },
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
        $7,
        $8,
        $9,
        NULL,
        $10,
        $11,
        $12::jsonb,
        now()
      )
      RETURNING *
      `,
      [
        entryGroupId,
        ownerType,
        ownerId,
        entry.money_zone,
        entry.direction,
        amount,
        sourceType,
        sourceId,
        `${sourceType} ${fromZone} to ${toZone}`,
        createdByType,
        createdById,
        JSON.stringify(sanitizedMetadata),
      ]
    );

    entries.push(insertResult.rows[0]);
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
    [ownerType, ownerId]
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

  const upsertResult = await client.query(
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
      ownerType,
      ownerId,
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

  return {
    entry_group_id: entryGroupId,
    entries,
    balances: [upsertResult.rows[0]],
  };
}

async function listPayoutExecutions(pool, filters = {}) {
  const where = [];
  const values = [];
  let index = 1;

  if (filters.owner_type) {
    where.push(`owner_type = $${index++}`);
    values.push(normalizeText(filters.owner_type));
  }

  if (filters.owner_id !== undefined && filters.owner_id !== null && filters.owner_id !== '') {
    where.push(`owner_id = $${index++}`);
    values.push(normalizeInt(filters.owner_id));
  }

  if (filters.status) {
    where.push(`status = $${index++}`);
    values.push(validatePayoutStatus(filters.status));
  }

  if (filters.withdraw_request_id !== undefined && filters.withdraw_request_id !== null && filters.withdraw_request_id !== '') {
    where.push(`withdraw_request_id = $${index++}`);
    values.push(normalizeInt(filters.withdraw_request_id));
  }

  if (filters.payout_mode) {
    where.push(`payout_mode = $${index++}`);
    values.push(normalizeText(filters.payout_mode));
  }

  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index++;
  values.push(offset);
  const offsetIndex = index++;

  const result = await pool.query(
    `
    SELECT *
    FROM public.payout_executions
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

async function getPayoutExecutionById(pool, id) {
  const payoutId = normalizeInt(id);
  if (!payoutId || payoutId <= 0) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT *
    FROM public.payout_executions
    WHERE id = $1
    LIMIT 1
    `,
    [payoutId]
  );

  return result.rows[0] || null;
}

async function createPayoutExecution(pool, input = {}, actor = {}) {
  assertMoneyCoreWriteAllowed();

  const withdrawRequestId = normalizeInt(input.withdraw_request_id);
  if (!withdrawRequestId || withdrawRequestId <= 0) {
    const error = new Error('withdraw_request_id is required');
    error.code = 'PAYOUT_WITHDRAW_REQUEST_ID_REQUIRED';
    error.statusCode = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const withdrawRequest = await loadWithdrawRequest(client, withdrawRequestId);
    if (!withdrawRequest) {
      const error = new Error('Withdraw request not found');
      error.code = 'WITHDRAW_REQUEST_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    if (!ALLOWED_WITHDRAW_STATUSES_FOR_CREATE.has(String(withdrawRequest.status || '').trim().toLowerCase())) {
      const error = new Error('Withdraw request cannot create payout');
      error.code = 'PAYOUT_WITHDRAW_REQUEST_STATUS_INVALID';
      error.statusCode = 400;
      throw error;
    }

    const existingResult = await client.query(
      `
      SELECT *
      FROM public.payout_executions
      WHERE withdraw_request_id = $1
      ORDER BY id ASC
      LIMIT 1
      `,
      [withdrawRequestId]
    );

    if (existingResult.rows[0]) {
      await client.query('COMMIT');
      return existingResult.rows[0];
    }

    const amount = normalizeNumber(withdrawRequest.locked_amount) || normalizeNumber(withdrawRequest.amount);
    if (!amount || amount <= 0) {
      const error = new Error('Invalid payout amount');
      error.code = 'PAYOUT_AMOUNT_INVALID';
      error.statusCode = 400;
      throw error;
    }

    const createResult = await client.query(
      `
      INSERT INTO public.payout_executions (
        withdraw_request_id,
        owner_type,
        owner_id,
        destination_id,
        payout_provider,
        payout_mode,
        amount,
        currency,
        status,
        external_ref,
        bank_reference,
        submitted_at,
        completed_at,
        failed_at,
        failure_reason,
        receipt_url,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, NULL, 'manual', $5, 'KGS', 'draft',
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, $6::jsonb, now(), now()
      )
      RETURNING *
      `,
      [
        withdrawRequestId,
        withdrawRequest.owner_type,
        withdrawRequest.owner_id,
        withdrawRequest.destination_id,
        amount,
        JSON.stringify(sanitizeJson(input.metadata_json ?? input.metadata ?? {})),
      ]
    );

    await client.query('COMMIT');
    return createResult.rows[0];
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

async function submitManualPayoutExecution(pool, id, input = {}, actor = {}) {
  assertMoneyCoreWriteAllowed();
  const payoutId = normalizeInt(id);
  if (!payoutId || payoutId <= 0) {
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const payout = await loadPayout(client, payoutId);
    if (!payout) {
      return null;
    }

    if (!ALLOWED_SUBMIT_STATUSES.has(String(payout.status || '').trim().toLowerCase())) {
      const error = new Error('Payout execution cannot be submitted');
      error.code = 'PAYOUT_STATUS_INVALID';
      error.statusCode = 400;
      throw error;
    }

    const updatedResult = await client.query(
      `
      UPDATE public.payout_executions
      SET
        status = 'submitted',
        payout_provider = COALESCE($2, payout_provider, 'manual'),
        submitted_at = now(),
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [payoutId, normalizeText(input.payout_provider)]
    );

    await client.query(
      `
      UPDATE public.withdraw_requests
      SET
        status = 'bank_processing',
        payout_execution_id = $2,
        updated_at = now()
      WHERE id = $1
      `,
      [updatedResult.rows[0].withdraw_request_id, payoutId]
    );

    await client.query('COMMIT');
    return updatedResult.rows[0];
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function completePayoutExecution(pool, id, input = {}, actor = {}) {
  assertMoneyCoreWriteAllowed();
  const payoutId = normalizeInt(id);
  if (!payoutId || payoutId <= 0) {
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const payout = await loadPayout(client, payoutId);
    if (!payout) {
      return null;
    }

    if (TERMINAL_PAYOUT_STATUSES.has(String(payout.status || '').trim().toLowerCase())) {
      const error = new Error('Payout already terminal');
      error.code = 'PAYOUT_ALREADY_TERMINAL';
      error.statusCode = 409;
      throw error;
    }

    if (!ALLOWED_COMPLETE_STATUSES.has(String(payout.status || '').trim().toLowerCase())) {
      const error = new Error('Payout execution cannot be completed');
      error.code = 'PAYOUT_STATUS_INVALID';
      error.statusCode = 400;
      throw error;
    }

    const externalRef = normalizeText(input.external_ref) || normalizeText(payout.external_ref);
    const bankReference = normalizeText(input.bank_reference) || normalizeText(payout.bank_reference);
    if (!externalRef && !bankReference) {
      const error = new Error('external_ref or bank_reference is required');
      error.code = 'PAYOUT_REFERENCE_REQUIRED';
      error.statusCode = 400;
      throw error;
    }

    const updatedPayoutResult = await client.query(
      `
      UPDATE public.payout_executions
      SET
        status = 'completed',
        external_ref = COALESCE($2, external_ref),
        bank_reference = COALESCE($3, bank_reference),
        receipt_url = COALESCE($4, receipt_url),
        completed_at = now(),
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [payoutId, externalRef, bankReference, normalizeText(input.receipt_url)]
    );

    const updatedWithdrawResult = await client.query(
      `
      UPDATE public.withdraw_requests
      SET
        status = 'completed',
        completed_at = now(),
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [payout.withdraw_request_id]
    );

    const amount = normalizeNumber(payout.amount);
    const ledger = await insertLedgerEntriesAndRebuildBalance(
      client,
      payout.owner_type,
      payout.owner_id,
      amount,
      'locked',
      'paid_out',
      'payout_execution',
      payout.id,
      sanitizeJson(input.metadata_json ?? input.metadata ?? {}),
      actor
    );

    await client.query('COMMIT');
    return {
      payout: updatedPayoutResult.rows[0],
      withdraw_request: updatedWithdrawResult.rows[0],
      ledger,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function failPayoutExecution(pool, id, input = {}, actor = {}) {
  assertMoneyCoreWriteAllowed();
  const payoutId = normalizeInt(id);
  if (!payoutId || payoutId <= 0) {
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const payout = await loadPayout(client, payoutId);
    if (!payout) {
      return null;
    }

    if (TERMINAL_PAYOUT_STATUSES.has(String(payout.status || '').trim().toLowerCase())) {
      const error = new Error('Payout already terminal');
      error.code = 'PAYOUT_ALREADY_TERMINAL';
      error.statusCode = 409;
      throw error;
    }

    if (!ALLOWED_FAIL_STATUSES.has(String(payout.status || '').trim().toLowerCase())) {
      const error = new Error('Payout execution cannot fail');
      error.code = 'PAYOUT_STATUS_INVALID';
      error.statusCode = 400;
      throw error;
    }

    const failureReason = normalizeText(input.failure_reason);
    if (!failureReason) {
      const error = new Error('failure_reason is required');
      error.code = 'PAYOUT_FAILURE_REASON_REQUIRED';
      error.statusCode = 400;
      throw error;
    }

    const updatedPayoutResult = await client.query(
      `
      UPDATE public.payout_executions
      SET
        status = 'failed',
        failure_reason = $2,
        failed_at = now(),
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [payoutId, failureReason]
    );

    const updatedWithdrawResult = await client.query(
      `
      UPDATE public.withdraw_requests
      SET
        status = 'failed',
        failed_at = now(),
        failure_reason = $2,
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [payout.withdraw_request_id, failureReason]
    );

    const amount = normalizeNumber(payout.amount);
    const ledger = await insertLedgerEntriesAndRebuildBalance(
      client,
      payout.owner_type,
      payout.owner_id,
      amount,
      'locked',
      'available',
      'payout_execution',
      payout.id,
      sanitizeJson(input.metadata_json ?? input.metadata ?? {}),
      actor
    );

    await client.query('COMMIT');
    return {
      payout: updatedPayoutResult.rows[0],
      withdraw_request: updatedWithdrawResult.rows[0],
      ledger,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

export {
  listPayoutExecutions,
  getPayoutExecutionById,
  createPayoutExecution,
  submitManualPayoutExecution,
  completePayoutExecution,
  failPayoutExecution,
};
