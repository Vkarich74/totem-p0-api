import test from 'node:test';
import assert from 'node:assert/strict';

import { createXpaySplitAllocationsForPayment } from '../../src/money-core/xpaySplitAllocations.service.js';

function normalizeSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim();
}

function assertNoForbiddenSql(sql) {
  const normalized = normalizeSql(sql);
  const forbiddenPatterns = [
    /public\.money_ledger_entries/i,
    /public\.money_owner_balances/i,
    /public\.money_owner_obligations/i,
    /public\.withdraw_requests/i,
    /public\.payout_executions/i,
    /UPDATE public\.payments/i,
    /UPDATE public\.bookings/i,
    /UPDATE public\.provider_settlements/i,
    /UPDATE public\.provider_settlement_items/i,
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

function buildContextRow(overrides = {}) {
  return {
    id: 22,
    booking_id: 46,
    provider: 'xpay',
    status: 'confirmed',
    amount: 4000,
    currency: 'KGS',
    collector_owner_type: 'master',
    collector_owner_id: 35,
    confirmed_at: '2026-06-14T12:00:00.000Z',
    payment_created_at: '2026-06-14T11:00:00.000Z',
    booking_row_id: 46,
    salon_id: 32,
    master_id: 35,
    booking_status: 'confirmed',
    booking_start_at: '2026-06-14T15:00:00.000Z',
    booking_datetime_start: '2026-06-14T15:00:00.000Z',
    booking_created_at: '2026-06-14T10:00:00.000Z',
    provider_settlement_row_id: 9001,
    provider_code: 'xpay',
    provider_settlement_key: 'xpay:payment:22',
    provider_settlement_item_id: 9002,
    ...overrides,
  };
}

function buildContract(overrides = {}) {
  return {
    id: 1,
    terms_json: {
      model: 'percentage',
      currency: 'KGS',
      master_percent: 75,
      salon_percent: 25,
      platform_percent: 0,
      ...overrides.terms_json,
    },
    ...overrides,
  };
}

test('skips non-xpay payment', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b, ps, psi')) {
      return { rows: [buildContextRow({ provider: 'direct' })] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createXpaySplitAllocationsForPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'NOT_XPAY_PAYMENT');
  assert.equal(client.calls.length, 1);
});

test('skips non-confirmed xpay payment', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b, ps, psi')) {
      return { rows: [buildContextRow({ status: 'pending' })] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createXpaySplitAllocationsForPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'NOT_CONFIRMED_PAYMENT');
  assert.equal(client.calls.length, 1);
});

test('skips zero or invalid amount', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b, ps, psi')) {
      return { rows: [buildContextRow({ amount: 0 })] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createXpaySplitAllocationsForPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'NO_AMOUNT_DUE');
  assert.equal(client.calls.length, 1);
});

test('skips cancelled booking', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b, ps, psi')) {
      return { rows: [buildContextRow({ booking_status: 'cancelled' })] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createXpaySplitAllocationsForPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'BOOKING_CANCELLED');
  assert.equal(client.calls.length, 1);
});

test('skips missing contract', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b, ps, psi')) {
      return { rows: [buildContextRow()] };
    }
    if (sql.includes('FROM public.contracts c')) {
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createXpaySplitAllocationsForPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'CONTRACT_MISSING');
  assert.equal(client.calls.length, 2);
});

test('skips when no split is due', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b, ps, psi')) {
      return { rows: [buildContextRow({ amount: 0 })] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createXpaySplitAllocationsForPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'NO_AMOUNT_DUE');
  assert.equal(result.inserted_count, 0);
  assert.equal(client.calls.some((call) => call.sql.startsWith('INSERT INTO public.money_split_allocations')), false);
  assert.equal(client.calls.length, 1);
});

test('creates split allocations', async () => {
  const insertedRows = [];
  const client = createMockClient(async (sql, params) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b, ps, psi')) {
      return { rows: [buildContextRow()] };
    }
    if (sql.includes('FROM public.contracts c')) {
      return { rows: [buildContract()] };
    }
    if (sql.startsWith('INSERT INTO public.money_split_allocations')) {
      const role = params[6];
      const ownerType = params[4];
      const ownerId = params[5];
      const amount = params[10];

      if (ownerType === 'salon') {
        assert.equal(ownerId, 32);
        assert.equal(role, 'salon');
        assert.equal(amount, 1000);
        const row = { id: 1001, owner_type: 'salon', owner_id: 32, role_in_split: 'salon', owner_net_amount: 1000 };
        insertedRows.push(row);
        return { rows: [row] };
      }

      if (ownerType === 'master') {
        assert.equal(ownerId, 35);
        assert.equal(role, 'master');
        assert.equal(amount, 3000);
        const row = { id: 1002, owner_type: 'master', owner_id: 35, role_in_split: 'master', owner_net_amount: 3000 };
        insertedRows.push(row);
        return { rows: [row] };
      }

      throw new Error(`Unexpected owner_type for insert: ${ownerType}`);
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createXpaySplitAllocationsForPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'created');
  assert.equal(result.inserted_count, 2);
  assert.equal(result.allocations.length, 2);
  assert.equal(insertedRows.length, 2);
  assert.equal(result.allocations.some((row) => row.owner_type === 'master' && Number(row.owner_net_amount) === 3000), true);
  assert.equal(result.allocations.some((row) => row.owner_type === 'salon' && Number(row.owner_net_amount) === 1000), true);
  assert.equal(client.calls.length, 4);
});

test('creates platform allocation when platform share exists', async () => {
  const client = createMockClient(async (sql, params) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b, ps, psi')) {
      return { rows: [buildContextRow()] };
    }
    if (sql.includes('FROM public.contracts c')) {
      return {
        rows: [
          buildContract({
            terms_json: {
              master_percent: 70,
              salon_percent: 20,
              platform_percent: 10,
            },
          }),
        ],
      };
    }
    if (sql.startsWith('INSERT INTO public.money_split_allocations')) {
      const ownerType = params[4];
      const ownerId = params[5];
      const role = params[6];
      const amount = params[10];

      if (ownerType === 'platform') {
        assert.equal(ownerId, 0);
        assert.equal(role, 'platform');
        assert.equal(amount, 400);
        return { rows: [{ id: 2003, owner_type: 'platform', owner_id: 0, role_in_split: 'platform', owner_net_amount: 400 }] };
      }

      if (ownerType === 'salon') {
        return { rows: [{ id: 2001, owner_type: 'salon', owner_id: 32, role_in_split: 'salon', owner_net_amount: 800 }] };
      }

      if (ownerType === 'master') {
        return { rows: [{ id: 2002, owner_type: 'master', owner_id: 35, role_in_split: 'master', owner_net_amount: 2800 }] };
      }

      throw new Error(`Unexpected owner_type for insert: ${ownerType}`);
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createXpaySplitAllocationsForPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'created');
  assert.equal(result.inserted_count, 3);
  assert.equal(result.allocations.some((row) => row.owner_type === 'platform' && Number(row.owner_net_amount) === 400), true);
  assert.equal(client.calls.length, 5);
});

test('existing allocation path is idempotent', async () => {
  const client = createMockClient(async (sql, params, callIndex) => {
    if (callIndex === 0) {
      assert.equal(sql.includes('FROM public.payments p'), true);
      return { rows: [buildContextRow()] };
    }
    if (callIndex === 1) {
      assert.equal(sql.includes('FROM public.contracts c'), true);
      return { rows: [buildContract()] };
    }
    if (callIndex === 2 || callIndex === 3) {
      assert.equal(sql.startsWith('INSERT INTO public.money_split_allocations'), true);
      return { rows: [] };
    }
    if (callIndex === 4) {
      assert.equal(sql.startsWith('SELECT * FROM public.money_split_allocations'), true);
      assert.equal(params[0], 9001);
      assert.equal(params[1], 22);
      return {
        rows: [
          { id: 3001, owner_type: 'salon', owner_id: 32, role_in_split: 'salon', owner_net_amount: 1000 },
          { id: 3002, owner_type: 'master', owner_id: 35, role_in_split: 'master', owner_net_amount: 3000 },
        ],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createXpaySplitAllocationsForPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'exists');
  assert.equal(result.reason, 'SPLIT_ALLOCATIONS_ALREADY_EXISTS');
  assert.equal(result.inserted_count, 0);
  assert.equal(result.allocations.length, 2);
  assert.equal(client.calls.length, 5);
});
