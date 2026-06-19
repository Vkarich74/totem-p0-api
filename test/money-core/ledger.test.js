import test from 'node:test';
import assert from 'node:assert/strict';

import {
  listMoneyLedgerEntries,
  getMoneyLedgerEntryById,
  getOwnerMoneyLedger,
  rebuildOwnerBalanceFromLedger,
  createMoneyLedgerMovement,
} from '../../src/money-core/ledger.service.js';

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
    /INSERT INTO public\.withdraw_requests/i,
    /INSERT INTO public\.payout_executions/i,
    /DELETE\b/i,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(normalized), false, `Forbidden SQL matched: ${pattern}`);
  }
}

function createMockClient(handler) {
  const calls = [];
  const client = {
    calls,
    releaseCalls: 0,
    async query(sql, params = []) {
      const normalizedSql = normalizeSql(sql);
      const normalizedParams = Array.isArray(params) ? [...params] : [];
      calls.push({ sql: normalizedSql, params: normalizedParams });
      assertNoForbiddenSql(normalizedSql);
      const result = await handler(normalizedSql, normalizedParams, calls.length - 1, client);
      if (!result || !Array.isArray(result.rows)) {
        return { rows: [] };
      }
      return { rows: result.rows };
    },
    async release() {
      client.releaseCalls += 1;
    },
  };

  return client;
}

function createMockPool(handler, { withConnect = false } = {}) {
  const calls = [];
  const pool = {
    calls,
    async query(sql, params = []) {
      const normalizedSql = normalizeSql(sql);
      const normalizedParams = Array.isArray(params) ? [...params] : [];
      calls.push({ sql: normalizedSql, params: normalizedParams });
      assertNoForbiddenSql(normalizedSql);
      const result = await handler(normalizedSql, normalizedParams, calls.length - 1, pool);
      if (!result || !Array.isArray(result.rows)) {
        return { rows: [] };
      }
      return { rows: result.rows };
    },
  };

  if (withConnect) {
    pool.connect = async () => createMockClient(handler);
  }

  return pool;
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

function buildLedgerRow(overrides = {}) {
  return {
    id: 101,
    entry_group_id: 'group-1',
    owner_type: 'master',
    owner_id: 35,
    money_zone: 'available',
    direction: 'credit',
    amount: 3000,
    currency: 'KGS',
    source_type: 'xpay_split_allocation',
    source_id: 501,
    reason: 'test_mock',
    provider_code: 'xpay',
    created_by_type: 'system',
    created_by_id: null,
    metadata_json: {},
    created_at: '2026-06-19T10:00:00.000Z',
    ...overrides,
  };
}

test('listMoneyLedgerEntries performs read-only ledger SELECT', async () => {
  const pool = createMockPool(async () => ({
    rows: [buildLedgerRow()],
  }));

  const rows = await listMoneyLedgerEntries(pool, {
    owner_type: 'master',
    owner_id: 35,
    money_zone: 'available',
    direction: 'credit',
    source_type: 'xpay_split_allocation',
    source_id: 501,
    currency: 'KGS',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].owner_type, 'master');
  assert.equal(pool.calls.length, 1);
  assert.equal(pool.calls[0].sql.startsWith('SELECT * FROM public.money_ledger_entries'), true);
  assert.equal(pool.calls[0].sql.includes('LIMIT $'), true);
  assert.equal(pool.calls[0].sql.includes('OFFSET $'), true);
});

test('getMoneyLedgerEntryById performs read-only ledger SELECT', async () => {
  const pool = createMockPool(async () => ({
    rows: [buildLedgerRow({ id: 77 })],
  }));

  const row = await getMoneyLedgerEntryById(pool, 77);

  assert.equal(row.id, 77);
  assert.equal(pool.calls.length, 1);
  assert.equal(pool.calls[0].sql.includes('FROM public.money_ledger_entries'), true);
  assert.equal(pool.calls[0].sql.includes('WHERE id = $1'), true);
});

test('getOwnerMoneyLedger performs read-only owner ledger SELECT', async () => {
  const pool = createMockPool(async () => ({
    rows: [buildLedgerRow()],
  }));

  const rows = await getOwnerMoneyLedger(pool, 'master', 35, {
    money_zone: 'available',
    direction: 'credit',
    source_type: 'xpay_split_allocation',
    source_id: 501,
  });

  assert.equal(rows.length, 1);
  assert.equal(pool.calls.length, 1);
  assert.equal(pool.calls[0].sql.includes('owner_type = $1'), true);
  assert.equal(pool.calls[0].sql.includes('owner_id = $2'), true);
  assert.equal(pool.calls[0].sql.includes('FROM public.money_ledger_entries'), true);
});

test('rebuildOwnerBalanceFromLedger calculates zone balances and upserts owner balance', async () => {
  const restoreFlags = setMoneyCoreFlags();
  const pool = createMockPool(async (sql, params, callIndex) => {
    if (callIndex === 0) {
      return {
        rows: [
          { money_zone: 'available', direction: 'credit', amount: 3000 },
          { money_zone: 'locked', direction: 'credit', amount: 500 },
          { money_zone: 'paid_out', direction: 'credit', amount: 1000 },
          { money_zone: 'paid_out', direction: 'debit', amount: 1000 },
        ],
      };
    }

    assert.equal(sql.startsWith('INSERT INTO public.money_owner_balances'), true);
    return {
      rows: [
        {
          owner_type: params[0],
          owner_id: params[1],
          currency: params[2],
          provider_hold: params[3],
          pending_settlement: params[4],
          available: params[5],
          locked: params[6],
          paid_out: params[7],
          refunded: params[8],
          reversed: params[9],
          fee_reserved: params[10],
          commission: params[11],
          requires_review: params[12],
        },
      ],
    };
  });

  try {
    const balance = await rebuildOwnerBalanceFromLedger(pool, 'master', 35, 'KGS');

    assert.equal(balance.owner_type, 'master');
    assert.equal(balance.owner_id, 35);
    assert.equal(balance.currency, 'KGS');
    assert.equal(balance.available, 3000);
    assert.equal(balance.locked, 500);
    assert.equal(balance.paid_out, 0);
    assert.equal(pool.calls.length, 2);
    assert.equal(pool.calls[0].sql.startsWith('SELECT money_zone, direction, amount'), true);
    assert.equal(pool.calls[1].sql.startsWith('INSERT INTO public.money_owner_balances'), true);
  } finally {
    restoreFlags();
  }
});

test('createMoneyLedgerMovement rejects invalid movement before DB write', async () => {
  const restoreFlags = setMoneyCoreFlags();
  try {
    const pool = {
      connectCalls: 0,
      async connect() {
        this.connectCalls += 1;
        throw new Error('connect should not be called');
      },
    };

    await assert.rejects(
      () =>
        createMoneyLedgerMovement(
          pool,
          {
            allow_single_entry: true,
            owner_type: 'invalid',
            owner_id: 35,
            money_zone: 'available',
            direction: 'credit',
            amount: 3000,
            currency: 'KGS',
            source_type: 'xpay_split_allocation',
            source_id: 501,
            reason: 'test_mock',
            provider_code: 'xpay',
          },
          { user_type: 'admin', user_id: 1 }
        ),
      (error) => error.code === 'MONEY_LEDGER_OWNER_TYPE_INVALID'
    );

    assert.equal(pool.connectCalls, 0);
  } finally {
    restoreFlags();
  }
});

test('createMoneyLedgerMovement inserts ledger movement and rebuilds owner balance', async () => {
  const restoreFlags = setMoneyCoreFlags();
  try {
    const client = createMockClient(async (sql, params, callIndex) => {
      if (callIndex === 0) {
        assert.equal(sql, 'BEGIN');
        return { rows: [] };
      }

      if (callIndex === 1) {
        assert.equal(sql.startsWith('INSERT INTO public.money_ledger_entries'), true);
        assert.equal(params[1], 'master');
        assert.equal(params[2], 35);
        assert.equal(params[3], 'available');
        assert.equal(params[4], 'credit');
        assert.equal(params[5], 3000);
        assert.equal(params[6], 'KGS');
        assert.equal(params[7], 'xpay_split_allocation');
        assert.equal(params[8], 501);
        assert.equal(params[9], 'test_mock');
        assert.equal(params[10], 'xpay');
        assert.equal(params[11], 'system');
        assert.equal(params[12], null);
        return {
          rows: [
            {
              id: 9001,
              owner_type: 'master',
              owner_id: 35,
              currency: 'KGS',
            },
          ],
        };
      }

      if (callIndex === 2) {
        assert.equal(sql.startsWith('SELECT money_zone, direction, amount FROM public.money_ledger_entries'), true);
        return {
          rows: [
            { money_zone: 'available', direction: 'credit', amount: 3000 },
          ],
        };
      }

      if (callIndex === 3) {
        assert.equal(sql.startsWith('INSERT INTO public.money_owner_balances'), true);
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

      if (callIndex === 4) {
        assert.equal(sql, 'COMMIT');
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const pool = {
      async connect() {
        return client;
      },
    };

    const result = await createMoneyLedgerMovement(
      pool,
      {
        entries: [
          {
            owner_type: 'master',
            owner_id: 35,
            money_zone: 'available',
            direction: 'credit',
            amount: 3000,
            currency: 'KGS',
            source_type: 'xpay_split_allocation',
            source_id: 501,
            reason: 'test_mock',
            provider_code: 'xpay',
          },
        ],
      },
      { user_type: 'admin', user_id: 1 }
    );

    assert.equal(result.entries.length, 1);
    assert.equal(result.balances.length, 1);
    assert.equal(client.releaseCalls, 1);
    assert.equal(client.calls.some((call) => call.sql === 'BEGIN'), true);
    assert.equal(client.calls.some((call) => call.sql === 'COMMIT'), true);
    assert.equal(client.calls.some((call) => call.sql.startsWith('INSERT INTO public.money_ledger_entries')), true);
    assert.equal(client.calls.some((call) => call.sql.startsWith('INSERT INTO public.money_owner_balances')), true);
  } finally {
    restoreFlags();
  }
});

test('createMoneyLedgerMovement rolls back and releases client on insert failure', async () => {
  const restoreFlags = setMoneyCoreFlags();
  try {
    const client = createMockClient(async (sql, params, callIndex) => {
      if (callIndex === 0) {
        assert.equal(sql, 'BEGIN');
        return { rows: [] };
      }

      if (callIndex === 1) {
        assert.equal(sql.startsWith('INSERT INTO public.money_ledger_entries'), true);
        throw new Error('insert failed');
      }

      if (callIndex === 2) {
        assert.equal(sql, 'ROLLBACK');
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const pool = {
      async connect() {
        return client;
      },
    };

    await assert.rejects(
      () =>
        createMoneyLedgerMovement(
          pool,
          {
            entries: [
              {
                owner_type: 'master',
                owner_id: 35,
                money_zone: 'available',
                direction: 'credit',
                amount: 3000,
                currency: 'KGS',
                source_type: 'xpay_split_allocation',
                source_id: 501,
                reason: 'test_mock',
                provider_code: 'xpay',
              },
            ],
          },
          { user_type: 'admin', user_id: 1 }
        ),
      /insert failed/
    );

    assert.equal(client.calls.some((call) => call.sql === 'BEGIN'), true);
    assert.equal(client.calls.some((call) => call.sql === 'ROLLBACK'), true);
    assert.equal(client.releaseCalls, 1);
  } finally {
    restoreFlags();
  }
});
