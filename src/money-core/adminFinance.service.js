'use strict';

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

function safePagination(filters = {}) {
  const limit = Math.min(Math.max(Number.parseInt(filters.limit, 10) || 100, 1), 500);
  const offset = Math.max(Number.parseInt(filters.offset, 10) || 0, 0);
  return { limit, offset };
}

function pushClause(where, values, indexState, clause, value) {
  where.push(`${clause} = $${indexState.current}`);
  values.push(value);
  indexState.current += 1;
}

function buildOwnerBalancesWhere(filters = {}) {
  const where = [];
  const values = [];
  const indexState = { current: 1 };

  if (filters.owner_type !== undefined && filters.owner_type !== null && filters.owner_type !== '') {
    pushClause(where, values, indexState, 'owner_type', normalizeText(filters.owner_type));
  }

  if (filters.owner_id !== undefined && filters.owner_id !== null && filters.owner_id !== '') {
    pushClause(where, values, indexState, 'owner_id', normalizeInt(filters.owner_id));
  }

  if (filters.currency !== undefined && filters.currency !== null && filters.currency !== '') {
    pushClause(where, values, indexState, 'currency', normalizeText(filters.currency));
  }

  return { where, values, index: indexState.current };
}

function buildWithdrawRequestsWhere(filters = {}) {
  const where = [];
  const values = [];
  const indexState = { current: 1 };

  if (filters.owner_type !== undefined && filters.owner_type !== null && filters.owner_type !== '') {
    pushClause(where, values, indexState, 'owner_type', normalizeText(filters.owner_type));
  }

  if (filters.owner_id !== undefined && filters.owner_id !== null && filters.owner_id !== '') {
    pushClause(where, values, indexState, 'owner_id', normalizeInt(filters.owner_id));
  }

  if (filters.status !== undefined && filters.status !== null && filters.status !== '') {
    pushClause(where, values, indexState, 'status', normalizeText(filters.status));
  }

  if (filters.destination_id !== undefined && filters.destination_id !== null && filters.destination_id !== '') {
    pushClause(where, values, indexState, 'destination_id', normalizeInt(filters.destination_id));
  }

  if (filters.risk_level !== undefined && filters.risk_level !== null && filters.risk_level !== '') {
    pushClause(where, values, indexState, 'risk_level', normalizeText(filters.risk_level));
  }

  return { where, values, index: indexState.current };
}

function buildPayoutExecutionsWhere(filters = {}) {
  const where = [];
  const values = [];
  const indexState = { current: 1 };

  if (filters.owner_type !== undefined && filters.owner_type !== null && filters.owner_type !== '') {
    pushClause(where, values, indexState, 'owner_type', normalizeText(filters.owner_type));
  }

  if (filters.owner_id !== undefined && filters.owner_id !== null && filters.owner_id !== '') {
    pushClause(where, values, indexState, 'owner_id', normalizeInt(filters.owner_id));
  }

  if (filters.status !== undefined && filters.status !== null && filters.status !== '') {
    pushClause(where, values, indexState, 'status', normalizeText(filters.status));
  }

  if (filters.provider_code !== undefined && filters.provider_code !== null && filters.provider_code !== '') {
    pushClause(where, values, indexState, 'payout_provider', normalizeText(filters.provider_code));
  }

  if (filters.payout_provider !== undefined && filters.payout_provider !== null && filters.payout_provider !== '') {
    pushClause(where, values, indexState, 'payout_provider', normalizeText(filters.payout_provider));
  }

  if (filters.payout_mode !== undefined && filters.payout_mode !== null && filters.payout_mode !== '') {
    pushClause(where, values, indexState, 'payout_mode', normalizeText(filters.payout_mode));
  }

  if (filters.withdraw_request_id !== undefined && filters.withdraw_request_id !== null && filters.withdraw_request_id !== '') {
    pushClause(where, values, indexState, 'withdraw_request_id', normalizeInt(filters.withdraw_request_id));
  }

  return { where, values, index: indexState.current };
}

function buildReconciliationRunsWhere(filters = {}) {
  const where = [];
  const values = [];
  const indexState = { current: 1 };

  if (filters.status !== undefined && filters.status !== null && filters.status !== '') {
    pushClause(where, values, indexState, 'status', normalizeText(filters.status));
  }

  if (filters.provider_code !== undefined && filters.provider_code !== null && filters.provider_code !== '') {
    pushClause(where, values, indexState, 'provider_code', normalizeText(filters.provider_code));
  }

  if (filters.run_type !== undefined && filters.run_type !== null && filters.run_type !== '') {
    pushClause(where, values, indexState, 'run_type', normalizeText(filters.run_type));
  }

  return { where, values, index: indexState.current };
}

function buildReconciliationMismatchesWhere(filters = {}) {
  const where = [];
  const values = [];
  const indexState = { current: 1 };

  if (filters.run_id !== undefined && filters.run_id !== null && filters.run_id !== '') {
    pushClause(where, values, indexState, 'm.run_id', normalizeInt(filters.run_id));
  }

  if (filters.severity !== undefined && filters.severity !== null && filters.severity !== '') {
    pushClause(where, values, indexState, 'm.severity', normalizeText(filters.severity));
  }

  if (filters.status !== undefined && filters.status !== null && filters.status !== '') {
    pushClause(where, values, indexState, 'm.status', normalizeText(filters.status));
  }

  if (filters.source_type !== undefined && filters.source_type !== null && filters.source_type !== '') {
    pushClause(where, values, indexState, 'm.source_type', normalizeText(filters.source_type));
  }

  if (filters.source_id !== undefined && filters.source_id !== null && filters.source_id !== '') {
    pushClause(where, values, indexState, 'm.source_id', normalizeInt(filters.source_id));
  }

  if (filters.provider_code !== undefined && filters.provider_code !== null && filters.provider_code !== '') {
    pushClause(where, values, indexState, 'r.provider_code', normalizeText(filters.provider_code));
  }

  return { where, values, index: indexState.current };
}

function buildProviderEventsWhere(filters = {}) {
  const where = [];
  const values = [];
  const indexState = { current: 1 };

  if (filters.provider_code !== undefined && filters.provider_code !== null && filters.provider_code !== '') {
    pushClause(where, values, indexState, 'provider_code', normalizeText(filters.provider_code));
  }

  if (filters.processing_status !== undefined && filters.processing_status !== null && filters.processing_status !== '') {
    pushClause(where, values, indexState, 'processing_status', normalizeText(filters.processing_status));
  }

  if (filters.status_normalized !== undefined && filters.status_normalized !== null && filters.status_normalized !== '') {
    pushClause(where, values, indexState, 'status_normalized', normalizeText(filters.status_normalized));
  }

  if (filters.event_type !== undefined && filters.event_type !== null && filters.event_type !== '') {
    pushClause(where, values, indexState, 'event_type', normalizeText(filters.event_type));
  }

  if (filters.payment_id !== undefined && filters.payment_id !== null && filters.payment_id !== '') {
    pushClause(where, values, indexState, 'payment_id', normalizeInt(filters.payment_id));
  }

  if (filters.booking_id !== undefined && filters.booking_id !== null && filters.booking_id !== '') {
    pushClause(where, values, indexState, 'booking_id', normalizeInt(filters.booking_id));
  }

  return { where, values, index: indexState.current };
}

function buildProviderSettlementsWhere(filters = {}) {
  const where = [];
  const values = [];
  const indexState = { current: 1 };

  if (filters.provider_code !== undefined && filters.provider_code !== null && filters.provider_code !== '') {
    pushClause(where, values, indexState, 'provider_code', normalizeText(filters.provider_code));
  }

  if (filters.status !== undefined && filters.status !== null && filters.status !== '') {
    pushClause(where, values, indexState, 'status', normalizeText(filters.status));
  }

  if (filters.settlement_source !== undefined && filters.settlement_source !== null && filters.settlement_source !== '') {
    pushClause(where, values, indexState, 'settlement_source', normalizeText(filters.settlement_source));
  }

  if (filters.provider_settlement_id !== undefined && filters.provider_settlement_id !== null && filters.provider_settlement_id !== '') {
    pushClause(where, values, indexState, 'provider_settlement_id', normalizeText(filters.provider_settlement_id));
  }

  return { where, values, index: indexState.current };
}

function buildMoneyReceiptsWhere(filters = {}) {
  const where = [];
  const values = [];
  const indexState = { current: 1 };

  if (filters.receipt_type !== undefined && filters.receipt_type !== null && filters.receipt_type !== '') {
    pushClause(where, values, indexState, 'receipt_type', normalizeText(filters.receipt_type));
  }

  if (filters.source_type !== undefined && filters.source_type !== null && filters.source_type !== '') {
    pushClause(where, values, indexState, 'source_type', normalizeText(filters.source_type));
  }

  if (filters.source_id !== undefined && filters.source_id !== null && filters.source_id !== '') {
    pushClause(where, values, indexState, 'source_id', normalizeInt(filters.source_id));
  }

  if (filters.owner_type !== undefined && filters.owner_type !== null && filters.owner_type !== '') {
    pushClause(where, values, indexState, 'owner_type', normalizeText(filters.owner_type));
  }

  if (filters.owner_id !== undefined && filters.owner_id !== null && filters.owner_id !== '') {
    pushClause(where, values, indexState, 'owner_id', normalizeInt(filters.owner_id));
  }

  if (filters.external_ref !== undefined && filters.external_ref !== null && filters.external_ref !== '') {
    pushClause(where, values, indexState, 'external_ref', normalizeText(filters.external_ref));
  }

  return { where, values, index: indexState.current };
}

function buildMoneyAuditEventsWhere(filters = {}) {
  const where = [];
  const values = [];
  const indexState = { current: 1 };

  if (filters.event_type !== undefined && filters.event_type !== null && filters.event_type !== '') {
    pushClause(where, values, indexState, 'event_type', normalizeText(filters.event_type));
  }

  if (filters.actor_type !== undefined && filters.actor_type !== null && filters.actor_type !== '') {
    pushClause(where, values, indexState, 'actor_type', normalizeText(filters.actor_type));
  }

  if (filters.actor_id !== undefined && filters.actor_id !== null && filters.actor_id !== '') {
    pushClause(where, values, indexState, 'actor_id', normalizeInt(filters.actor_id));
  }

  if (filters.owner_type !== undefined && filters.owner_type !== null && filters.owner_type !== '') {
    pushClause(where, values, indexState, 'owner_type', normalizeText(filters.owner_type));
  }

  if (filters.owner_id !== undefined && filters.owner_id !== null && filters.owner_id !== '') {
    pushClause(where, values, indexState, 'owner_id', normalizeInt(filters.owner_id));
  }

  if (filters.source_type !== undefined && filters.source_type !== null && filters.source_type !== '') {
    pushClause(where, values, indexState, 'source_type', normalizeText(filters.source_type));
  }

  if (filters.source_id !== undefined && filters.source_id !== null && filters.source_id !== '') {
    pushClause(where, values, indexState, 'source_id', normalizeInt(filters.source_id));
  }

  return { where, values, index: indexState.current };
}

async function buildAdminMoneyCoreOverview(pool) {
  const [
    providerEvents,
    settlements,
    balances,
    withdrawRequests,
    payouts,
    reconciliationRuns,
    reconciliationMismatches,
    moneyReceipts,
    moneyAuditEvents,
  ] = await Promise.all([
    pool.query(
      `
      SELECT
        COUNT(*)::bigint AS total_count,
        COUNT(*) FILTER (WHERE processing_status = 'failed')::bigint AS failed_count,
        COUNT(*) FILTER (WHERE processing_status = 'requires_review')::bigint AS requires_review_count
      FROM public.provider_events
      `
    ),
    pool.query(
      `
      SELECT
        COUNT(*)::bigint AS total_count,
        COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed_count,
        COUNT(*) FILTER (WHERE status = 'requires_review')::bigint AS requires_review_count
      FROM public.provider_settlements
      `
    ),
    pool.query(
      `
      SELECT
        COUNT(*)::bigint AS total_count,
        SUM(available)::numeric AS available_sum,
        SUM(locked)::numeric AS locked_sum
      FROM public.money_owner_balances
      `
    ),
    pool.query(
      `
      SELECT
        COUNT(*)::bigint AS total_count,
        COUNT(*) FILTER (WHERE status = 'locked')::bigint AS locked_count,
        COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed_count,
        COUNT(*) FILTER (WHERE status = 'completed')::bigint AS completed_count
      FROM public.withdraw_requests
      `
    ),
    pool.query(
      `
      SELECT
        COUNT(*)::bigint AS total_count,
        COUNT(*) FILTER (WHERE status = 'submitted')::bigint AS submitted_count,
        COUNT(*) FILTER (WHERE status = 'completed')::bigint AS completed_count,
        COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed_count
      FROM public.payout_executions
      `
    ),
    pool.query(
      `
      SELECT
        COUNT(*)::bigint AS total_count,
        COUNT(*) FILTER (WHERE status = 'running')::bigint AS running_count,
        COUNT(*) FILTER (WHERE status = 'completed_with_mismatches')::bigint AS completed_with_mismatches_count,
        COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed_count
      FROM public.money_reconciliation_runs
      `
    ),
    pool.query(
      `
      SELECT
        COUNT(*)::bigint AS total_count,
        COUNT(*) FILTER (WHERE status = 'open')::bigint AS open_count,
        COUNT(*) FILTER (WHERE status = 'requires_review')::bigint AS requires_review_count
      FROM public.money_reconciliation_mismatches
      `
    ),
    pool.query(
      `
      SELECT
        COUNT(*)::bigint AS total_count
      FROM public.money_receipts
      `
    ),
    pool.query(
      `
      SELECT
        COUNT(*)::bigint AS total_count
      FROM public.money_audit_events
      `
    ),
  ]);

  return {
    provider_events: providerEvents.rows[0],
    provider_settlements: settlements.rows[0],
    owner_balances: balances.rows[0],
    withdraw_requests: withdrawRequests.rows[0],
    payout_executions: payouts.rows[0],
    reconciliation_runs: reconciliationRuns.rows[0],
    reconciliation_mismatches: reconciliationMismatches.rows[0],
    money_receipts: moneyReceipts.rows[0],
    money_audit_events: moneyAuditEvents.rows[0],
  };
}

async function listAdminOwnerBalances(pool, filters = {}) {
  const { where, values, index } = buildOwnerBalancesWhere(filters);
  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index;
  values.push(offset);
  const offsetIndex = index + 1;

  const result = await pool.query(
    `
    SELECT *
    FROM public.money_owner_balances
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

async function listAdminWithdrawRequests(pool, filters = {}) {
  const { where, values, index } = buildWithdrawRequestsWhere(filters);
  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index;
  values.push(offset);
  const offsetIndex = index + 1;

  const result = await pool.query(
    `
    SELECT *
    FROM public.withdraw_requests
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

async function listAdminPayoutExecutions(pool, filters = {}) {
  const { where, values, index } = buildPayoutExecutionsWhere(filters);
  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index;
  values.push(offset);
  const offsetIndex = index + 1;

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

async function listAdminReconciliationRuns(pool, filters = {}) {
  const { where, values, index } = buildReconciliationRunsWhere(filters);
  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index;
  values.push(offset);
  const offsetIndex = index + 1;

  const result = await pool.query(
    `
    SELECT *
    FROM public.money_reconciliation_runs
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

async function listAdminMoneyCoreExceptions(pool, filters = {}) {
  const { where, values, index } = buildReconciliationMismatchesWhere(filters);
  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index;
  values.push(offset);
  const offsetIndex = index + 1;

  const result = await pool.query(
    `
    SELECT
      m.*,
      r.run_type,
      r.status AS run_status,
      r.created_by AS run_created_by
    FROM public.money_reconciliation_mismatches m
    LEFT JOIN public.money_reconciliation_runs r
      ON r.id = m.run_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY m.id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

async function listAdminProviderEvents(pool, filters = {}) {
  const { where, values, index } = buildProviderEventsWhere(filters);
  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index;
  values.push(offset);
  const offsetIndex = index + 1;

  const result = await pool.query(
    `
    SELECT *
    FROM public.provider_events
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

async function listAdminProviderSettlements(pool, filters = {}) {
  const { where, values, index } = buildProviderSettlementsWhere(filters);
  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index;
  values.push(offset);
  const offsetIndex = index + 1;

  const result = await pool.query(
    `
    SELECT *
    FROM public.provider_settlements
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

async function listAdminMoneyReceipts(pool, filters = {}) {
  const { where, values, index } = buildMoneyReceiptsWhere(filters);
  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index;
  values.push(offset);
  const offsetIndex = index + 1;

  const result = await pool.query(
    `
    SELECT *
    FROM public.money_receipts
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

async function listAdminMoneyAuditEvents(pool, filters = {}) {
  const { where, values, index } = buildMoneyAuditEventsWhere(filters);
  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index;
  values.push(offset);
  const offsetIndex = index + 1;

  const result = await pool.query(
    `
    SELECT *
    FROM public.money_audit_events
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

export {
  buildMoneyReceiptsWhere,
  buildMoneyAuditEventsWhere,
  buildAdminMoneyCoreOverview,
  listAdminOwnerBalances,
  listAdminWithdrawRequests,
  listAdminPayoutExecutions,
  listAdminReconciliationRuns,
  listAdminMoneyCoreExceptions,
  listAdminProviderEvents,
  listAdminProviderSettlements,
  listAdminMoneyReceipts,
  listAdminMoneyAuditEvents,
};
