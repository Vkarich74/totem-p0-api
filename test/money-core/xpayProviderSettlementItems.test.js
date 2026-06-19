import test from 'node:test';
import assert from 'node:assert/strict';

import { createProviderSettlementItemForXpayPayment } from '../../src/money-core/xpayProviderSettlementItems.service.js';

function normalizeSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim();
}

function assertNoForbiddenSql(sql) {
  const normalized = normalizeSql(sql);
  const forbiddenPatterns = [
    /public\.money_ledger_entries/i,
    /public\.money_owner_balances/i,
    /public\.money_owner_obligations/i,
    /public\.money_split_allocations/i,
    /public\.withdraw_requests/i,
    /public\.payout_executions/i,
    /^\s*UPDATE\b/i,
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
    method: 'qr',
    confirmed_at: '2026-06-14T12:00:00.000Z',
    payment_created_at: '2026-06-14T11:00:00.000Z',
    qr_transaction_id: 'QR-22',
    booking_row_id: 46,
    salon_id: 32,
    master_id: 35,
    booking_status: 'confirmed',
    service_id: 35,
    price_snapshot: 4000,
    booking_start_at: '2026-06-14T15:00:00.000Z',
    booking_datetime_start: '2026-06-14T15:00:00.000Z',
    booking_created_at: '2026-06-14T10:00:00.000Z',
    ...overrides,
  };
}

test('skips non-xpay payment', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b')) {
      return { rows: [buildContextRow({ provider: 'direct' })] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createProviderSettlementItemForXpayPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'NOT_XPAY_PAYMENT');
  assert.equal(client.calls.length, 1);
});

test('skips non-confirmed xpay payment', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b')) {
      return { rows: [buildContextRow({ status: 'pending' })] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createProviderSettlementItemForXpayPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'NOT_CONFIRMED_PAYMENT');
  assert.equal(client.calls.length, 1);
});

test('skips zero amount xpay payment', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b')) {
      return { rows: [buildContextRow({ amount: 0 })] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createProviderSettlementItemForXpayPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'NO_AMOUNT_DUE');
  assert.equal(client.calls.length, 1);
});

test('skips cancelled booking', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b')) {
      return { rows: [buildContextRow({ booking_status: 'cancelled' })] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createProviderSettlementItemForXpayPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'BOOKING_CANCELLED');
  assert.equal(client.calls.length, 1);
});

test('existing provider settlement item path is idempotent', async () => {
  const client = createMockClient(async (sql) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b')) {
      return { rows: [buildContextRow()] };
    }
    if (sql.includes('FROM public.provider_settlement_items psi') && sql.includes("ps.provider_code = 'xpay'")) {
      return { rows: [{ id: 555, provider_settlement_id: 777 }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createProviderSettlementItemForXpayPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'exists');
  assert.equal(result.reason, 'PROVIDER_SETTLEMENT_ITEM_ALREADY_EXISTS');
  assert.equal(result.inserted_count, 0);
  assert.equal(result.provider_settlement_id, 777);
  assert.equal(result.provider_settlement_item_id, 555);
  assert.equal(client.calls.length, 2);
});

test('creates settlement bucket and settlement item', async () => {
  const client = createMockClient(async (sql, params) => {
    if (sql.includes('FROM public.payments p') && sql.includes('FOR UPDATE OF p, b')) {
      return { rows: [buildContextRow()] };
    }

    if (sql.includes('FROM public.provider_settlement_items psi') && sql.includes("ps.provider_code = 'xpay'")) {
      return { rows: [] };
    }

    if (sql.startsWith('INSERT INTO public.provider_settlements')) {
      assert.equal(sql.includes("provider_code"), true);
      assert.equal(sql.includes("'xpay'"), true);
      assert.equal(sql.includes("'api'"), true);
      assert.equal(params[0], 'xpay:payment:22');
      assert.equal(params[1], 4000);
      assert.equal(params[2], 4000);
      assert.equal(params[3], 'KGS');
      assert.equal(params[5].includes('c20_h_xpay_provider_settlement_item_bridge'), true);
      const metadata = JSON.parse(params[5]);
      assert.equal(metadata.source, 'c20_h_xpay_provider_settlement_item_bridge');
      assert.equal(metadata.payment_id, 22);
      assert.equal(metadata.booking_id, 46);
      assert.equal(metadata.salon_id, 32);
      assert.equal(metadata.master_id, 35);
      assert.equal(metadata.provider, 'xpay');
      return { rows: [{ id: 9001 }] };
    }

    if (sql.startsWith('INSERT INTO public.provider_settlement_items')) {
      assert.equal(params[0], 9001);
      assert.equal(params[1], 22);
      assert.equal(params[2], 'QR-22');
      assert.equal(params[3], 46);
      assert.equal(params[4], 4000);
      assert.equal(params[5], 4000);
      assert.equal(params[6], 'KGS');
      return { rows: [{ id: 9002 }] };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createProviderSettlementItemForXpayPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'created');
  assert.equal(result.reason, null);
  assert.equal(result.inserted_count, 1);
  assert.equal(result.provider_settlement_id, 9001);
  assert.equal(result.provider_settlement_item_id, 9002);
  assert.equal(client.calls.length, 4);
});

test('idempotent after insert conflict', async () => {
  const client = createMockClient(async (sql, params, callIndex) => {
    if (callIndex === 0) {
      assert.equal(sql.includes('FROM public.payments p'), true);
      return { rows: [buildContextRow()] };
    }

    if (callIndex === 1) {
      assert.equal(sql.includes('FROM public.provider_settlement_items psi'), true);
      return { rows: [] };
    }

    if (callIndex === 2) {
      assert.equal(sql.startsWith('INSERT INTO public.provider_settlements'), true);
      return { rows: [{ id: 9001 }] };
    }

    if (callIndex === 3) {
      assert.equal(sql.startsWith('INSERT INTO public.provider_settlement_items'), true);
      return { rows: [] };
    }

    if (callIndex === 4) {
      assert.equal(sql.includes('FROM public.provider_settlement_items psi'), true);
      assert.equal(params[0], 9001);
      assert.equal(params[1], 22);
      return { rows: [{ id: 555, provider_settlement_id: 9001 }] };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await createProviderSettlementItemForXpayPayment(client, { paymentId: 22 });

  assert.equal(result.status, 'exists');
  assert.equal(result.reason, 'PROVIDER_SETTLEMENT_ITEM_ALREADY_EXISTS');
  assert.equal(result.inserted_count, 0);
  assert.equal(result.provider_settlement_id, 9001);
  assert.equal(result.provider_settlement_item_id, 555);
  assert.equal(client.calls.length, 5);
});
