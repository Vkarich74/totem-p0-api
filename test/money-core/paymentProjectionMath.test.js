import test from 'node:test';
import assert from 'node:assert/strict';

import { computePaymentShareBreakdown } from '../../src/money-core/paymentProjectionMath.js';

function buildBreakdown(overrides = {}) {
  return computePaymentShareBreakdown({
    payment: {
      id: 22,
      amount: 4000,
      gross_amount: 4000,
      status: 'confirmed',
      payment_status: 'confirmed',
      booking_status: 'confirmed',
      provider: 'direct',
      collector_owner_type: 'master',
      collector_owner_id: 35,
      salon_id: 32,
      master_id: 35,
      ...overrides.payment,
    },
    booking: {
      id: 46,
      status: 'confirmed',
      salon_id: 32,
      master_id: 35,
      ...overrides.booking,
    },
    contract: {
      id: 1,
      terms_json: {
        model: 'percentage',
        currency: 'KGS',
        salon_percent: 25,
        master_percent: 75,
        platform_percent: 0,
      },
      ...overrides.contract,
    },
  });
}

test('confirmed percentage payment computes gross/master/salon/platform shares', () => {
  const result = buildBreakdown();

  assert.equal(result.live_money, true);
  assert.equal(result.gross_amount, 4000);
  assert.equal(result.master_share, 3000);
  assert.equal(result.salon_share, 1000);
  assert.equal(result.platform_share, 0);
  assert.equal(result.share_residual, 0);
  assert.equal(result.calculation_status, 'shares_calculated_transfer_ready');
  assert.equal(result.settlement_status, 'transfer_required');
});

test('cancelled booking produces zero live money', () => {
  const result = buildBreakdown({
    payment: {
      booking_status: 'cancelled',
    },
    booking: {
      status: 'cancelled',
    },
  });

  assert.equal(result.live_money, false);
  assert.equal(result.gross_amount, 0);
  assert.equal(result.master_share, 0);
  assert.equal(result.salon_share, 0);
  assert.equal(result.platform_share, 0);
  assert.equal(result.share_residual, 0);
  assert.equal(result.calculation_status, 'not_financial_cancelled_or_rejected');
  assert.equal(result.settlement_status, 'not_financial');
});

test('rejected booking produces zero live money', () => {
  const result = buildBreakdown({
    payment: {
      booking_status: 'rejected',
    },
    booking: {
      status: 'rejected',
    },
  });

  assert.equal(result.live_money, false);
  assert.equal(result.gross_amount, 0);
  assert.equal(result.master_share, 0);
  assert.equal(result.salon_share, 0);
  assert.equal(result.platform_share, 0);
  assert.equal(result.share_residual, 0);
  assert.equal(result.calculation_status, 'not_financial_cancelled_or_rejected');
  assert.equal(result.settlement_status, 'not_financial');
});

test('pending payment produces zero live money', () => {
  const result = buildBreakdown({
    payment: {
      status: 'pending',
      payment_status: 'pending',
    },
  });

  assert.equal(result.live_money, false);
  assert.equal(result.gross_amount, 0);
  assert.equal(result.master_share, 0);
  assert.equal(result.salon_share, 0);
  assert.equal(result.platform_share, 0);
  assert.equal(result.share_residual, 0);
  assert.equal(result.calculation_status, 'not_financial_cancelled_or_rejected');
  assert.equal(result.settlement_status, 'not_financial');
});

test('collector-resolved direct cash is not marked missing collector', () => {
  const result = buildBreakdown({
    payment: {
      provider: 'direct',
      collector_owner_type: 'master',
      collector_owner_id: 35,
    },
  });

  assert.notEqual(result.calculation_status, 'shares_calculated_transfer_blocked_missing_collector');
  assert.notEqual(result.settlement_status, 'blocked_missing_collector');
  assert.equal(result.transfer_from_type, 'master');
  assert.equal(result.transfer_from_id, 35);
  assert.equal(result.transfer_to_type, 'salon');
  assert.equal(result.transfer_to_id, 32);
  assert.equal(result.transfer_amount, 1000);
  assert.equal(result.included_in_open_balance, true);
});

test('missing collector direct cash is blocked as missing collector', () => {
  const result = buildBreakdown({
    payment: {
      provider: 'direct',
      collector_owner_type: null,
      collector_owner_id: null,
    },
  });

  assert.equal(result.calculation_status, 'shares_calculated_transfer_blocked_missing_collector');
  assert.equal(result.settlement_status, 'blocked_missing_collector');
  assert.equal(result.included_in_open_balance, false);
  assert.equal(result.transfer_amount, null);
});

test('residual rounding remains balanced', () => {
  const result = computePaymentShareBreakdown({
    payment: {
      id: 99,
      amount: 1000,
      gross_amount: 1000,
      status: 'confirmed',
      payment_status: 'confirmed',
      booking_status: 'confirmed',
      provider: 'direct',
      collector_owner_type: 'salon',
      collector_owner_id: 32,
      salon_id: 32,
      master_id: 35,
    },
    booking: {
      id: 46,
      status: 'confirmed',
      salon_id: 32,
      master_id: 35,
    },
    contract: {
      id: 2,
      terms_json: {
        model: 'percentage',
        currency: 'KGS',
        salon_percent: 33,
        master_percent: 33,
        platform_percent: 33,
      },
    },
  });

  const sum = Number(result.master_share || 0) + Number(result.salon_share || 0) + Number(result.platform_share || 0) + Number(result.share_residual || 0);

  assert.equal(result.gross_amount, 1000);
  assert.equal(result.master_share, 330);
  assert.equal(result.salon_share, 330);
  assert.equal(result.platform_share, 330);
  assert.equal(result.share_residual, 10);
  assert.equal(sum, 1000);
});
