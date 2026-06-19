import test from 'node:test';
import assert from 'node:assert/strict';

import { createDirectCashObligationsForConfirmedPayment } from '../../src/money-core/directCashObligations.service.js';

function normalizeSql(sql) {
  return String(sql || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function assertNoForbiddenSql(sql) {
  const forbidden = [
    'public.money_ledger_entries',
    'public.money_owner_balances',
    'public.provider_settlements',
    'public.provider_settlement_items',
    'public.money_split_allocations',
    'public.withdraw_requests',
    'public.payout',
    'BEGIN',
    'COMMIT',
    'ROLLBACK',
    'DELETE',
  ];

  for (const token of forbidden) {
    assert.equal(
      normalizeSql(sql).toUpperCase().includes(token.toUpperCase()),
      false,
      `Forbidden SQL token found: ${token}`
    );
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
      if (!result) {
        return { rows: [] };
      }

      if (!Array.isArray(result.rows)) {
        return { rows: [] };
      }

      return { rows: result.rows };
    },
  };
}

function buildPaymentRow(overrides = {}) {
  return {
    id: 22,
    payment_booking_id: 46,
    provider: 'direct',
    status: 'confirmed',
    amount: 4000,
    currency: 'KGS',
    collector_owner_type: 'master',
    collector_owner_id: 35,
    confirmed_at: null,
    confirmed_by_user_id: null,
    payment_created_at: '2026-06-14T12:00:00.000Z',
    booking_id: 46,
    salon_id: 32,
    master_id: 35,
    booking_status: 'confirmed',
    price_snapshot: 4000,
    service_id: 35,
    booking_start_at: '2026-06-14T15:00:00.000Z',
    booking_datetime_start: '2026-06-14T15:00:00.000Z',
    booking_created_at: '2026-06-14T10:00:00.000Z',
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

test('skips when paymentId is missing', async () => {
  const client = createMockClient(async () => ({ rows: [] }));

  const result = await createDirectCashObligationsForConfirmedPayment(client, {});

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'PAYMENT_NOT_FOUND');
  assert.equal(client.calls.length, 0);
});

test('skips non-direct payment', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b')) {
      return { rows: [buildPaymentRow({ provider: 'xpay' })] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createDirectCashObligationsForConfirmedPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'NOT_DIRECT_PAYMENT');
  assert.equal(client.calls.length, 1);
});

test('skips non-confirmed direct payment', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b')) {
      return { rows: [buildPaymentRow({ status: 'pending' })] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createDirectCashObligationsForConfirmedPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'NOT_CONFIRMED_PAYMENT');
  assert.equal(client.calls.length, 1);
});

test('skips missing collector', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b')) {
      return { rows: [buildPaymentRow({ collector_owner_type: null, collector_owner_id: null })] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createDirectCashObligationsForConfirmedPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'COLLECTOR_MISSING');
  assert.equal(client.calls.length, 1);
});

test('skips cancelled booking', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b')) {
      return { rows: [buildPaymentRow({ booking_status: 'cancelled' })] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createDirectCashObligationsForConfirmedPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'BOOKING_CANCELLED');
  assert.equal(client.calls.length, 1);
});

test('skips platform share nonzero', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b')) {
      return { rows: [buildPaymentRow()] };
    }
    if (sql.includes('FROM public.contracts c')) {
      return {
        rows: [buildContract({ terms_json: { master_percent: 60, salon_percent: 30, platform_percent: 10 } })],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createDirectCashObligationsForConfirmedPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'PLATFORM_SHARE_NONZERO_UNSUPPORTED_C20C');
  assert.equal(client.calls.length, 2);
  assert.equal(client.calls.some((call) => call.sql.startsWith('INSERT INTO public.money_owner_obligations')), false);
});

test('creates salon obligation when collector is master', async () => {
  const client = createMockClient(async (sql, params, callIndex) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b')) {
      return { rows: [buildPaymentRow()] };
    }
    if (sql.includes('FROM public.contracts c')) {
      return { rows: [buildContract()] };
    }
    if (sql.startsWith('INSERT INTO public.money_owner_obligations')) {
      assert.equal(params[0], 22);
      assert.equal(params[1], 46);
      assert.equal(params[2], 'master');
      assert.equal(params[3], 35);
      assert.equal(params[4], 'salon');
      assert.equal(params[5], 32);
      assert.equal(params[6], 1000);
      assert.equal(params[7], 'KGS');
      assert.equal(params[8], 'salon_share');
      const payload = JSON.parse(params[9]);
      assert.equal(payload.source, 'c20_direct_cash_obligation_bridge');
      assert.equal(payload.payment_id, 22);
      assert.equal(payload.booking_id, 46);
      assert.equal(payload.collector_owner_type, 'master');
      assert.equal(payload.collector_owner_id, 35);
      assert.equal(payload.reason, 'direct_cash_confirm');
      return { rows: [{ id: 101, source_type: 'direct_payment' }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createDirectCashObligationsForConfirmedPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'created');
  assert.equal(result.reason, null);
  assert.equal(result.inserted_count, 1);
  assert.equal(result.obligation.id, 101);
  assert.equal(client.calls.length, 3);
});

test('creates master obligation when collector is salon', async () => {
  const client = createMockClient(async (sql, params) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b')) {
      return {
        rows: [buildPaymentRow({ collector_owner_type: 'salon', collector_owner_id: 32 })],
      };
    }
    if (sql.includes('FROM public.contracts c')) {
      return { rows: [buildContract()] };
    }
    if (sql.startsWith('INSERT INTO public.money_owner_obligations')) {
      assert.equal(params[2], 'salon');
      assert.equal(params[3], 32);
      assert.equal(params[4], 'master');
      assert.equal(params[5], 35);
      assert.equal(params[6], 3000);
      assert.equal(params[8], 'master_share');
      return { rows: [{ id: 202, source_type: 'direct_payment' }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createDirectCashObligationsForConfirmedPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'created');
  assert.equal(result.inserted_count, 1);
  assert.equal(result.obligation.id, 202);
  assert.equal(client.calls.length, 3);
});

test('existing obligation path is idempotent', async () => {
  const client = createMockClient(async (sql, params) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b')) {
      return { rows: [buildPaymentRow()] };
    }
    if (sql.includes('FROM public.contracts c')) {
      return { rows: [buildContract()] };
    }
    if (sql.startsWith('INSERT INTO public.money_owner_obligations')) {
      return { rows: [] };
    }
    if (sql.startsWith('SELECT * FROM public.money_owner_obligations')) {
      assert.equal(params[0], 22);
      assert.equal(params[1], 'master');
      assert.equal(params[2], 35);
      assert.equal(params[3], 'salon');
      assert.equal(params[4], 32);
      assert.equal(params[5], 'salon_share');
      return { rows: [{ id: 303, source_type: 'direct_payment' }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createDirectCashObligationsForConfirmedPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'exists');
  assert.equal(result.reason, 'OBLIGATION_ALREADY_EXISTS');
  assert.equal(result.inserted_count, 0);
  assert.equal(result.obligation.id, 303);
  assert.equal(client.calls.length, 4);
});
