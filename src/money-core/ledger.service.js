'use strict';

import { randomUUID } from 'crypto';
import { assertMoneyCoreWriteAllowed } from './config.js';

const ALLOWED_OWNER_TYPES = new Set(['salon', 'master', 'platform', 'system']);
const ALLOWED_MONEY_ZONES = new Set([
  'provider_hold',
  'pending_settlement',
  'available',
  'locked',
  'paid_out',
  'refunded',
  'reversed',
  'fee_reserved',
  'commission',
  'requires_review',
  'manual_adjustment',
]);
const ALLOWED_DIRECTIONS = new Set(['debit', 'credit']);

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

function validateLedgerMovement(movement = {}) {
  const ownerType = normalizeText(movement.owner_type);
  const ownerId = normalizeInt(movement.owner_id);
  const moneyZone = normalizeText(movement.money_zone);
  const direction = normalizeText(movement.direction);
  const amount = normalizeNumber(movement.amount);
  const currency = normalizeText(movement.currency) || 'KGS';
  const sourceType = normalizeText(movement.source_type);
  const sourceId = normalizeInt(movement.source_id);

  if (!ownerType || !ALLOWED_OWNER_TYPES.has(ownerType)) {
    const error = new Error('Invalid owner_type');
    error.code = 'MONEY_LEDGER_OWNER_TYPE_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!ownerId || ownerId <= 0) {
    const error = new Error('owner_id is required');
    error.code = 'MONEY_LEDGER_OWNER_ID_REQUIRED';
    error.statusCode = 400;
    throw error;
  }

  if (!moneyZone || !ALLOWED_MONEY_ZONES.has(moneyZone)) {
    const error = new Error('Invalid money_zone');
    error.code = 'MONEY_LEDGER_ZONE_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!direction || !ALLOWED_DIRECTIONS.has(direction)) {
    const error = new Error('Invalid direction');
    error.code = 'MONEY_LEDGER_DIRECTION_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!sourceType) {
    const error = new Error('source_type is required');
    error.code = 'MONEY_LEDGER_SOURCE_TYPE_REQUIRED';
    error.statusCode = 400;
    throw error;
  }

  if (!sourceId || sourceId <= 0) {
    const error = new Error('source_id is required');
    error.code = 'MONEY_LEDGER_SOURCE_ID_REQUIRED';
    error.statusCode = 400;
    throw error;
  }

  if (currency !== 'KGS') {
    const error = new Error('Invalid currency');
    error.code = 'MONEY_LEDGER_CURRENCY_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (amount === null || amount <= 0) {
    const error = new Error('amount must be greater than 0');
    error.code = 'MONEY_LEDGER_AMOUNT_INVALID';
    error.statusCode = 400;
    throw error;
  }

  return {
    owner_type: ownerType,
    owner_id: ownerId,
    money_zone: moneyZone,
    direction,
    amount,
    currency,
    source_type: sourceType,
    source_id: sourceId,
    reason: normalizeText(movement.reason),
    provider_code: normalizeText(movement.provider_code),
    created_by_type: normalizeText(movement.created_by_type) || 'system',
    created_by_id: normalizeInt(movement.created_by_id),
    metadata_json: sanitizeJson(movement.metadata_json ?? movement.metadata ?? {}),
    entry_group_id: normalizeText(movement.entry_group_id) || randomUUID(),
  };
}

async function listMoneyLedgerEntries(pool, filters = {}) {
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

  if (filters.money_zone) {
    where.push(`money_zone = $${index++}`);
    values.push(normalizeText(filters.money_zone));
  }

  if (filters.direction) {
    where.push(`direction = $${index++}`);
    values.push(normalizeText(filters.direction));
  }

  if (filters.source_type) {
    where.push(`source_type = $${index++}`);
    values.push(normalizeText(filters.source_type));
  }

  if (filters.source_id !== undefined && filters.source_id !== null && filters.source_id !== '') {
    where.push(`source_id = $${index++}`);
    values.push(normalizeInt(filters.source_id));
  }

  if (filters.entry_group_id) {
    where.push(`entry_group_id = $${index++}`);
    values.push(normalizeText(filters.entry_group_id));
  }

  if (filters.currency) {
    where.push(`currency = $${index++}`);
    values.push(normalizeText(filters.currency));
  }

  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index++;
  values.push(offset);
  const offsetIndex = index++;

  const result = await pool.query(
    `
    SELECT *
    FROM public.money_ledger_entries
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

async function getMoneyLedgerEntryById(pool, id) {
  const entryId = normalizeInt(id);
  if (!entryId || entryId <= 0) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT *
    FROM public.money_ledger_entries
    WHERE id = $1
    LIMIT 1
    `,
    [entryId]
  );

  return result.rows[0] || null;
}

async function getOwnerMoneyLedger(pool, ownerType, ownerId, filters = {}) {
  const normalizedOwnerType = normalizeText(ownerType);
  const normalizedOwnerId = normalizeInt(ownerId);

  if (!normalizedOwnerType || !ALLOWED_OWNER_TYPES.has(normalizedOwnerType) || !normalizedOwnerId || normalizedOwnerId <= 0) {
    return [];
  }

  const where = ['owner_type = $1', 'owner_id = $2'];
  const values = [normalizedOwnerType, normalizedOwnerId];
  let index = 3;

  if (filters.money_zone) {
    where.push(`money_zone = $${index++}`);
    values.push(normalizeText(filters.money_zone));
  }

  if (filters.direction) {
    where.push(`direction = $${index++}`);
    values.push(normalizeText(filters.direction));
  }

  if (filters.source_type) {
    where.push(`source_type = $${index++}`);
    values.push(normalizeText(filters.source_type));
  }

  if (filters.source_id !== undefined && filters.source_id !== null && filters.source_id !== '') {
    where.push(`source_id = $${index++}`);
    values.push(normalizeInt(filters.source_id));
  }

  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index++;
  values.push(offset);
  const offsetIndex = index++;

  const result = await pool.query(
    `
    SELECT *
    FROM public.money_ledger_entries
    WHERE ${where.join(' AND ')}
    ORDER BY id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

function buildBalanceFromZones(zoneRows = []) {
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

  for (const row of zoneRows) {
    const zone = row.money_zone;
    const delta = row.direction === 'credit' ? Number(row.amount) : -Number(row.amount);
    if (Object.prototype.hasOwnProperty.call(balance, zone)) {
      balance[zone] += delta;
    }
  }

  return balance;
}

async function resolveDbClient(poolOrClient) {
  if (poolOrClient && typeof poolOrClient.query === 'function' && typeof poolOrClient.connect !== 'function') {
    return { client: poolOrClient, owned: false };
  }

  if (poolOrClient && typeof poolOrClient.connect === 'function') {
    const client = await poolOrClient.connect();
    return { client, owned: true };
  }

  const error = new Error('Invalid database handle');
  error.code = 'MONEY_LEDGER_DB_HANDLE_INVALID';
  error.statusCode = 500;
  throw error;
}

async function rebuildOwnerBalanceFromLedger(pool, ownerType, ownerId, currency = 'KGS', actor = {}) {
  assertMoneyCoreWriteAllowed();

  const normalizedOwnerType = normalizeText(ownerType);
  const normalizedOwnerId = normalizeInt(ownerId);
  const normalizedCurrency = normalizeText(currency) || 'KGS';

  if (!normalizedOwnerType || !ALLOWED_OWNER_TYPES.has(normalizedOwnerType) || !normalizedOwnerId || normalizedOwnerId <= 0) {
    const error = new Error('Invalid owner reference');
    error.code = 'MONEY_LEDGER_OWNER_INVALID';
    error.statusCode = 400;
    throw error;
  }

  const { client, owned } = await resolveDbClient(pool);
  try {
    if (owned) {
      await client.query('BEGIN');
    }

    const rowsResult = await client.query(
      `
      SELECT money_zone, direction, amount
      FROM public.money_ledger_entries
      WHERE owner_type = $1
        AND owner_id = $2
        AND currency = $3
      ORDER BY id ASC
      `,
      [normalizedOwnerType, normalizedOwnerId, normalizedCurrency]
    );

    const balance = buildBalanceFromZones(rowsResult.rows);
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now()
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
        normalizedOwnerType,
        normalizedOwnerId,
        normalizedCurrency,
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

    if (owned) {
      await client.query('COMMIT');
    }
    return upsertResult.rows[0] || null;
  } catch (error) {
    try {
      if (owned) {
        await client.query('ROLLBACK');
      }
    } catch (_) {
      // ignore rollback failure
    }
    throw error;
  } finally {
    if (owned) {
      client.release();
    }
  }
}

async function createMoneyLedgerMovement(pool, movement = {}, actor = {}) {
  assertMoneyCoreWriteAllowed();

  const entriesInput = Array.isArray(movement.entries) ? movement.entries : null;
  const normalizedEntryGroupId = normalizeText(movement.entry_group_id) || randomUUID();

  let preparedEntries = [];

  if (entriesInput && entriesInput.length > 0) {
    preparedEntries = entriesInput.map((entry) => {
      const normalized = validateLedgerMovement({
        ...movement,
        ...entry,
        entry_group_id: normalizedEntryGroupId,
      });

      return {
        ...normalized,
        entry_group_id: normalizedEntryGroupId,
      };
    });

    if (preparedEntries.length > 1) {
      const debitCount = preparedEntries.filter((entry) => entry.direction === 'debit').length;
      const creditCount = preparedEntries.filter((entry) => entry.direction === 'credit').length;
      const totalDebit = preparedEntries
        .filter((entry) => entry.direction === 'debit')
        .reduce((sum, entry) => sum + Number(entry.amount), 0);
      const totalCredit = preparedEntries
        .filter((entry) => entry.direction === 'credit')
        .reduce((sum, entry) => sum + Number(entry.amount), 0);

      if (debitCount < 1 || creditCount < 1 || totalDebit !== totalCredit) {
        const error = new Error('Money ledger group is unbalanced');
        error.code = 'MONEY_LEDGER_GROUP_UNBALANCED';
        error.statusCode = 400;
        throw error;
      }
    }
  } else {
    if (movement.allow_single_entry !== true) {
      const error = new Error('Money ledger group is required');
      error.code = 'MONEY_LEDGER_GROUP_REQUIRED';
      error.statusCode = 400;
      throw error;
    }

    const normalizedMovement = validateLedgerMovement({
      ...movement,
      entry_group_id: normalizedEntryGroupId,
    });

    preparedEntries = [
      {
        ...normalizedMovement,
        entry_group_id: normalizedEntryGroupId,
      },
    ];
  }

  if (!preparedEntries.length) {
    const error = new Error('Money ledger group is required');
    error.code = 'MONEY_LEDGER_GROUP_REQUIRED';
    error.statusCode = 400;
    throw error;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const insertedRows = [];
    for (const entry of preparedEntries) {
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
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14::jsonb,
          now()
        )
        RETURNING *
        `,
        [
          entry.entry_group_id,
          entry.owner_type,
          entry.owner_id,
          entry.money_zone,
          entry.direction,
          entry.amount,
          entry.currency,
          entry.source_type,
          entry.source_id,
          entry.reason,
          entry.provider_code,
          entry.created_by_type,
          entry.created_by_id,
          JSON.stringify(entry.metadata_json),
        ]
      );

      insertedRows.push(insertResult.rows[0]);
    }

    const affectedOwners = [];
    for (const entry of insertedRows) {
      const key = `${entry.owner_type}:${entry.owner_id}:${entry.currency}`;
      if (!affectedOwners.some((item) => item.key === key)) {
        affectedOwners.push({
          key,
          owner_type: entry.owner_type,
          owner_id: entry.owner_id,
          currency: entry.currency,
        });
      }
    }

    const balances = [];
    for (const affectedOwner of affectedOwners) {
      const balance = await rebuildOwnerBalanceFromLedger(
        client,
        affectedOwner.owner_type,
        affectedOwner.owner_id,
        affectedOwner.currency,
        actor
      );

      balances.push(balance);
    }

    await client.query('COMMIT');

    return {
      entry_group_id: normalizedEntryGroupId,
      entries: insertedRows,
      balances,
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
  listMoneyLedgerEntries,
  getMoneyLedgerEntryById,
  getOwnerMoneyLedger,
  rebuildOwnerBalanceFromLedger,
  createMoneyLedgerMovement,
};
