import test from 'node:test';
import assert from 'node:assert/strict';

import { createLedgerEntriesForXpaySettlement } from '../../src/money-core/xpayLedgerBridge.service.js';

function normalizeSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim();
}

function assertNoForbiddenSql(sql) {
  const normalized = normalizeSql(sql);
  const forbiddenPatterns = [
    /UPDATE public\.payments/i,
    /UPDATE public\.bookings/i,
    /INSERT INTO public\.payments/i,
    /INSERT INTO public\.bookings/i,
    /INSERT INTO public\.money_owner_obligations/i,
    /INSERT INTO public\.money_split_allocations/i,
    /INSERT INTO public\.provider_settlements/i,
    /INSERT INTO public\.provider_settlement_items/i,
    /^\s*DELETE\b/i,
    /^\s*BEGIN\b/i,
    /^\s*COMMIT\b/i,
    /^\s*ROLLBACK\b/i,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(normalized), false, `Forbidden SQL matched: ${pattern}`);
  }
}

function createMockClient(handler) {
  const calls = [];

  return {
    calls,
    async query(sql, params = []) {
      const normalizedSql = normalizeSql(sql);
      const normalizedParams = Array.isArray(params) ? [...params] : [];
      calls.push({ sql: normalizedSql, params: normalizedParams });
      assertNoForbiddenSql(normalizedSql);

      const result = await handler(normalizedSql, normalizedParams, calls.length - 1);
      if (!result || !Array.isArray(result.rows)) {
        return { rows: [] };
      }

      return { rows: result.rows };
    },
  };
}

function setMoneyCoreFlags(overrides = {}) {
  const keys = [
    'MONEY_CORE_ENABLED',
    'MONEY_CORE_READ_ONLY',
    'MONEY_CORE_WRITE_ENABLED',
    'MONEY_CORE_LEDGER_MOVEMENTS_ENABLED',
  ];
  const previous = {};

  for (const key of keys) {
    previous[key] = process.env[key];
  }

  const next = {
    MONEY_CORE_ENABLED: 'true',
    MONEY_CORE_READ_ONLY: 'false',
    MONEY_CORE_WRITE_ENABLED: 'true',
    MONEY_CORE_LEDGER_MOVEMENTS_ENABLED: 'true',
    ...overrides,
  };

  for (const key of keys) {
    if (next[key] === undefined || next[key] === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(next[key]);
    }
  }

  return () => {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  };
}

function setGlobalValue(name, value) {
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, name);
  const previous = globalThis[name];

  if (value === undefined) {
    delete globalThis[name];
  } else {
    globalThis[name] = value;
  }

  return () => {
    if (hadOwn) {
      globalThis[name] = previous;
    } else {
      delete globalThis[name];
    }
  };
}

function buildSettlementRow(overrides = {}) {
  return {
    id: 9001,
    provider_code: 'xpay',
    settlement_source: 'api',
    provider_settlement_id: 'xpay:payment:22',
    status: 'bank_received',
    amount_gross: 4000,
    amount_fee: 0,
    amount_net: 4000,
    currency: 'KGS',
    bank_received_at: '2026-06-19T10:00:00.000Z',
    manual_confirmed_by: null,
    manual_confirmed_at: null,
    created_at: '2026-06-19T09:00:00.000Z',
    updated_at: '2026-06-19T10:00:00.000Z',
    ...overrides,
  };
}

function buildItemRow(overrides = {}) {
  return {
    id: 9002,
    provider_settlement_id: 9001,
    payment_id: 22,
    provider_payment_id: 'QR-22',
    booking_id: 46,
    amount_gross: 4000,
    provider_fee: 0,
    amount_net: 4000,
    currency: 'KGS',
    status: 'created',
    created_at: '2026-06-19T10:00:00.000Z',
    ...overrides,
  };
}

function buildAllocationRow(overrides = {}) {
  return {
    id: 5001,
    payment_id: 22,
    booking_id: 46,
    provider_settlement_id: 9001,
    owner_type: 'master',
    owner_id: 35,
    role_in_split: 'master',
    gross_amount: 3000,
    provider_fee_amount: 0,
    platform_fee_amount: 0,
    owner_net_amount: 3000,
    currency: 'KGS',
    status: 'allocated',
    ledger_group_id: null,
    created_at: '2026-06-19T10:00:00.000Z',
    updated_at: '2026-06-19T10:00:00.000Z',
    ...overrides,
  };
}

test('skips when ledger movements are disabled', async () => {
  const restore = setMoneyCoreFlags({ MONEY_CORE_LEDGER_MOVEMENTS_ENABLED: 'false' });
  try {
    const client = createMockClient(async () => ({ rows: [] }));
    const result = await createLedgerEntriesForXpaySettlement(client, { providerSettlementId: 9001 });

    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'LEDGER_MOVEMENTS_DISABLED');
    assert.equal(client.calls.length, 0);
  } finally {
    restore();
  }
});

test('skips non-xpay settlement', async () => {
  const restore = setMoneyCoreFlags();
  try {
    const client = createMockClient(async (sql) => {
      if (sql.includes('FROM public.provider_settlements ps')) {
        return { rows: [buildSettlementRow({ provider_code: 'manual' })] };
      }
      if (sql.includes('FROM public.provider_settlement_items psi') && sql.includes('WHERE psi.provider_settlement_id = $1')) {
        return { rows: [buildItemRow()] };
      }
      if (sql.includes('FROM public.money_split_allocations msa')) {
        return { rows: [buildAllocationRow()] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await createLedgerEntriesForXpaySettlement(client, { providerSettlementId: 9001 });

    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'NOT_XPAY_SETTLEMENT');
    assert.equal(client.calls.length, 3);
  } finally {
    restore();
  }
});

test('skips settlement not ready', async () => {
  const restore = setMoneyCoreFlags();
  try {
    const client = createMockClient(async (sql) => {
      if (sql.includes('FROM public.provider_settlements ps')) {
        return { rows: [buildSettlementRow({ status: 'draft' })] };
      }
      if (sql.includes('FROM public.provider_settlement_items psi') && sql.includes('WHERE psi.provider_settlement_id = $1')) {
        return { rows: [buildItemRow()] };
      }
      if (sql.includes('FROM public.money_split_allocations msa')) {
        return { rows: [buildAllocationRow()] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await createLedgerEntriesForXpaySettlement(client, { providerSettlementId: 9001 });

    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'SETTLEMENT_NOT_READY');
    assert.equal(client.calls.length, 3);
  } finally {
    restore();
  }
});

test('skips no settlement items', async () => {
  const restore = setMoneyCoreFlags();
  try {
    const client = createMockClient(async (sql) => {
      if (sql.includes('FROM public.provider_settlements ps')) {
        return { rows: [buildSettlementRow()] };
      }
      if (sql.includes('FROM public.provider_settlement_items psi') && sql.includes('WHERE psi.provider_settlement_id = $1')) {
        return { rows: [] };
      }
      if (sql.includes('FROM public.money_split_allocations msa')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await createLedgerEntriesForXpaySettlement(client, { providerSettlementId: 9001 });

    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'NO_SETTLEMENT_ITEMS');
    assert.equal(client.calls.length, 3);
  } finally {
    restore();
  }
});

test('skips no ledger amount due', async () => {
  const restore = setMoneyCoreFlags();
  try {
    const client = createMockClient(async (sql) => {
      if (sql.includes('FROM public.provider_settlements ps')) {
        return { rows: [buildSettlementRow()] };
      }
      if (sql.includes('FROM public.provider_settlement_items psi') && sql.includes('WHERE psi.provider_settlement_id = $1')) {
        return { rows: [buildItemRow()] };
      }
      if (sql.includes('FROM public.money_split_allocations msa')) {
        return {
          rows: [
            buildAllocationRow({ owner_net_amount: 0, status: 'allocated', role_in_split: 'master' }),
            buildAllocationRow({ id: 5002, owner_type: 'salon', owner_id: 32, role_in_split: 'salon', owner_net_amount: 0, gross_amount: 0, status: 'draft' }),
          ],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await createLedgerEntriesForXpaySettlement(client, { providerSettlementId: 9001 });

    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'NO_LEDGER_AMOUNT_DUE');
    assert.equal(client.calls.length, 3);
  } finally {
    restore();
  }
});

test('creates ledger entries for eligible xpay split allocations', async () => {
  const restore = setMoneyCoreFlags();
  const restoreGlobalAllocationOwnerId = setGlobalValue('allocationOwnerId', 35);
  try {
    const rebalanceCalls = [];
    const client = createMockClient(async (sql, params, callIndex) => {
      if (callIndex === 0) {
        return { rows: [buildSettlementRow()] };
      }

      if (callIndex === 1) {
        return {
          rows: [
            buildItemRow({ provider_settlement_id: 9001 }),
          ],
        };
      }

      if (callIndex === 2) {
        return {
          rows: [
            buildAllocationRow({
              id: 5001,
              owner_type: 'master',
              owner_id: 35,
              role_in_split: 'master',
              owner_net_amount: 3000,
              gross_amount: 3000,
            }),
          ],
        };
      }

      if (callIndex === 3 && sql.startsWith('INSERT INTO public.money_ledger_entries')) {
        assert.equal(sql.includes("'available'"), true);
        assert.equal(sql.includes("'credit'"), true);
        assert.equal(sql.includes("'xpay_split_allocation'"), true);
        assert.equal(sql.includes("'xpay'"), true);
        assert.equal(params[1], 'master');
        assert.equal(params[2], 35);
        assert.equal(params[3], 3000);
        assert.equal(params[4], 5001);
        assert.equal(params[5], 'xpay_provider_settlement_available');
        assert.equal(params[6], 'system');
        assert.equal(params[7], null);
        return { rows: [{ id: 7003 }] };
      }

      if (callIndex === 4 && sql.startsWith('SELECT money_zone, direction, amount')) {
        rebalanceCalls.push({ sql, params });
        return {
          rows: [
            { money_zone: 'available', direction: 'credit', amount: 3000 },
          ],
        };
      }

      if (callIndex === 5 && sql.startsWith('INSERT INTO public.money_owner_balances')) {
        return {
          rows: [
            {
              owner_type: params[0],
              owner_id: params[1],
              currency: params[2],
              available: params[5],
            },
          ],
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await createLedgerEntriesForXpaySettlement(client, { providerSettlementId: 9001 });

    assert.equal(result.status, 'created');
    assert.equal(result.ledger_inserted_count, 1);
    assert.equal(result.ledger_existing_count, 0);
    assert.equal(result.owners_rebuilt_count, 1);
    assert.equal(rebalanceCalls.length, 1);
    assert.equal(client.calls.some((call) => call.sql.startsWith('INSERT INTO public.money_ledger_entries')), true);
    assert.equal(client.calls.some((call) => call.sql.startsWith('INSERT INTO public.money_owner_balances')), true);
    assert.equal(client.calls.some((call) => call.sql.includes('public.provider_settlements')), true);
    assert.equal(client.calls.some((call) => call.sql.includes('public.provider_settlement_items')), true);
  } finally {
    restoreGlobalAllocationOwnerId();
    restore();
  }
});

test('idempotent existing ledger path', async () => {
  const restore = setMoneyCoreFlags();
  const restoreGlobalAllocationOwnerId = setGlobalValue('allocationOwnerId', 35);
  try {
    const client = createMockClient(async (sql, params, callIndex) => {
      if (callIndex === 0) {
        return { rows: [buildSettlementRow()] };
      }
      if (callIndex === 1) {
        return { rows: [buildItemRow()] };
      }
      if (callIndex === 2) {
        return {
          rows: [
            buildAllocationRow({
              id: 5001,
              owner_type: 'master',
              owner_id: 35,
              role_in_split: 'master',
              owner_net_amount: 3000,
              gross_amount: 3000,
            }),
          ],
        };
      }
      if (callIndex === 3) {
        assert.equal(sql.startsWith('INSERT INTO public.money_ledger_entries'), true);
        return { rows: [] };
      }
      if (callIndex === 4) {
        assert.equal(sql.startsWith('SELECT money_zone, direction, amount'), true);
        return {
          rows: [
            { money_zone: 'available', direction: 'credit', amount: 3000 },
          ],
        };
      }
      if (callIndex === 5) {
        assert.equal(sql.startsWith('INSERT INTO public.money_owner_balances'), true);
        return { rows: [{ owner_type: params[0], owner_id: params[1], currency: params[2] }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await createLedgerEntriesForXpaySettlement(client, { providerSettlementId: 9001 });

    assert.equal(result.status, 'exists');
    assert.equal(result.reason, 'LEDGER_ALREADY_EXISTS');
    assert.equal(result.ledger_inserted_count, 0);
    assert.equal(result.ledger_existing_count, 1);
    assert.equal(result.owners_rebuilt_count, 1);
  } finally {
    restoreGlobalAllocationOwnerId();
    restore();
  }
});
