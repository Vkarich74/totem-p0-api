import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOwnerMoneyCoreSummary } from '../../src/money-core/balances.service.js';

function normalizeSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim();
}

function assertNoForbiddenSql(sql) {
  const normalized = normalizeSql(sql);
  const forbiddenPatterns = [
    /public\.payments/i,
    /public\.bookings/i,
    /INSERT INTO public\.money_ledger_entries/i,
    /public\.money_owner_obligations/i,
    /public\.money_split_allocations/i,
    /public\.provider_settlements/i,
    /public\.provider_settlement_items/i,
    /^\s*DELETE\b/i,
    /^\s*BEGIN\b/i,
    /^\s*COMMIT\b/i,
    /^\s*ROLLBACK\b/i,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(normalized), false, `Forbidden SQL matched: ${pattern}`);
  }
}

function createMockPool(handler) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const normalizedSql = normalizeSql(sql);
      const normalizedParams = Array.isArray(params) ? [...params] : [];
      calls.push({ sql: normalizedSql, params: normalizedParams });
      assertNoForbiddenSql(normalizedSql);
      const result = await handler(normalizedSql, normalizedParams, calls.length - 1, calls);
      if (!result || !Array.isArray(result.rows)) {
        return { rows: [] };
      }
      return { rows: result.rows };
    },
  };
}

test('invalid ownerType returns OWNER_TYPE_INVALID and does not query DB', async () => {
  const pool = createMockPool(async () => {
    throw new Error('DB should not be queried');
  });

  const result = await buildOwnerMoneyCoreSummary(pool, { ownerType: 'invalid', slug: 'master-prime' });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
  assert.equal(result.error, 'OWNER_TYPE_INVALID');
  assert.equal(pool.calls.length, 0);
});

test('missing slug returns OWNER_SLUG_REQUIRED and does not query DB', async () => {
  const pool = createMockPool(async () => {
    throw new Error('DB should not be queried');
  });

  const result = await buildOwnerMoneyCoreSummary(pool, { ownerType: 'master', slug: '' });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
  assert.equal(result.error, 'OWNER_SLUG_REQUIRED');
  assert.equal(pool.calls.length, 0);
});

test('master slug resolves owner id and returns zero balance fallback', async () => {
  const pool = createMockPool(async (sql, params, callIndex) => {
    if (callIndex === 0) {
      assert.equal(sql.startsWith('SELECT id, slug, name, active FROM public.masters WHERE slug = $1 LIMIT 1'), true);
      assert.deepEqual(params, ['master-prime-begimai']);
      return {
        rows: [
          {
            id: 35,
            slug: 'master-prime-begimai',
            name: 'Begimai',
            active: true,
          },
        ],
      };
    }

    if (callIndex === 1) {
      assert.equal(sql.includes('FROM public.money_owner_balances'), true);
      assert.deepEqual(params, ['master', 35]);
      return { rows: [] };
    }

    if (callIndex === 2) {
      assert.equal(sql.startsWith('SELECT id, amount, currency, status, destination_id, expected_payout_date, created_at, updated_at FROM public.withdraw_requests'), true);
      assert.deepEqual(params[0], 'master');
      assert.deepEqual(params[1], 35);
      assert.equal(Array.isArray(params[2]), true);
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await buildOwnerMoneyCoreSummary(pool, { ownerType: 'master', slug: 'master-prime-begimai' });

  assert.equal(result.ok, true);
  assert.equal(result.owner.id, 35);
  assert.equal(result.owner.type, 'master');
  assert.equal(result.available, '0');
  assert.equal(result.locked, '0');
  assert.equal(result.active_withdraws.length, 0);
  assert.equal(pool.calls.length, 3);
});

test('salon slug resolves owner id and returns existing money_owner_balances row', async () => {
  const pool = createMockPool(async (sql, params, callIndex) => {
    if (callIndex === 0) {
      assert.equal(sql.startsWith('SELECT id, slug, name, enabled, status FROM public.salons WHERE slug = $1 LIMIT 1'), true);
      assert.deepEqual(params, ['master-prime']);
      return {
        rows: [
          {
            id: 32,
            slug: 'master-prime',
            name: 'Master Prime',
            enabled: true,
            status: 'active',
          },
        ],
      };
    }

    if (callIndex === 1) {
      assert.equal(sql.includes('FROM public.money_owner_balances'), true);
      assert.deepEqual(params, ['salon', 32]);
      return {
        rows: [
          {
            provider_hold: '0',
            pending_settlement: '0',
            available: '1000',
            locked: '0',
            paid_out: '0',
            refunded: '0',
            reversed: '0',
            fee_reserved: '0',
            commission: '0',
            requires_review: '0',
          },
        ],
      };
    }

    if (callIndex === 2) {
      assert.equal(sql.startsWith('SELECT id, amount, currency, status, destination_id, expected_payout_date, created_at, updated_at FROM public.withdraw_requests'), true);
      assert.deepEqual(params[0], 'salon');
      assert.deepEqual(params[1], 32);
      return {
        rows: [
          {
            id: 7001,
            amount: '500',
            currency: 'KGS',
            status: 'created',
            destination_id: null,
            expected_payout_date: null,
            created_at: '2026-06-19T10:00:00.000Z',
            updated_at: '2026-06-19T10:00:00.000Z',
          },
        ],
      };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await buildOwnerMoneyCoreSummary(pool, { ownerType: 'salon', slug: 'master-prime' });

  assert.equal(result.ok, true);
  assert.equal(result.owner.id, 32);
  assert.equal(result.owner.type, 'salon');
  assert.equal(result.available, '1000');
  assert.equal(result.provider_hold, '0');
  assert.equal(result.active_withdraws.length, 1);
  assert.equal(result.active_withdraws[0].id, 7001);
  assert.equal(pool.calls.length, 3);
});

test('active withdraws are read and returned in active_withdraws', async () => {
  const pool = createMockPool(async (sql, params, callIndex) => {
    if (callIndex === 0) {
      return {
        rows: [
          {
            id: 35,
            slug: 'master-prime-begimai',
            name: 'Begimai',
            active: true,
          },
        ],
      };
    }

    if (callIndex === 1) {
      return { rows: [] };
    }

    if (callIndex === 2) {
      assert.equal(sql.includes('FROM public.withdraw_requests'), true);
      return {
        rows: [
          {
            id: 7101,
            amount: '100',
            currency: 'KGS',
            status: 'pending_validation',
            destination_id: 99,
            expected_payout_date: '2026-06-20',
            created_at: '2026-06-19T10:00:00.000Z',
            updated_at: '2026-06-19T10:00:00.000Z',
          },
          {
            id: 7102,
            amount: '250',
            currency: 'KGS',
            status: 'created',
            destination_id: 100,
            expected_payout_date: null,
            created_at: '2026-06-18T10:00:00.000Z',
            updated_at: '2026-06-18T10:00:00.000Z',
          },
        ],
      };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const result = await buildOwnerMoneyCoreSummary(pool, { ownerType: 'master', slug: 'master-prime-begimai' });

  assert.equal(result.ok, true);
  assert.equal(result.active_withdraws.length, 2);
  assert.equal(result.active_withdraws[0].id, 7101);
  assert.equal(result.active_withdraws[1].id, 7102);
  assert.equal(pool.calls.length, 3);
});

test('summary does not write to DB', async () => {
  const pool = createMockPool(async (sql, params, callIndex) => {
    if (callIndex === 0) {
      return {
        rows: [
          {
            id: 35,
            slug: 'master-prime-begimai',
            name: 'Begimai',
            active: true,
          },
        ],
      };
    }

    if (callIndex === 1) {
      return { rows: [] };
    }

    if (callIndex === 2) {
      return { rows: [] };
    }

    throw new Error(`Unexpected query: ${sql}`);
  });

  const result = await buildOwnerMoneyCoreSummary(pool, { ownerType: 'master', slug: 'master-prime-begimai' });

  assert.equal(result.ok, true);
  assert.equal(pool.calls.length, 3);
  assert.equal(pool.calls.some((call) => /^\s*(INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)\b/i.test(call.sql)), false);
});
