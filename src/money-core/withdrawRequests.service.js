'use strict';

import { randomUUID } from 'crypto';
import { assertMoneyCoreWriteAllowed } from './config.js';
import { createNotification } from '../services/notifications/notificationService.js';
import { buildWithdrawRequestLockedNotificationTemplate } from '../services/notifications/notificationTemplates.js';

const ALLOWED_OWNER_TYPES = new Set(['salon', 'master', 'platform', 'system']);
const ALLOWED_CREATION_MODES = new Set(['manual', 'scheduled', 'admin', 'system']);
const ALLOWED_REQUEST_STATUSES = new Set([
  'created',
  'pending_validation',
  'requires_review',
  'locked',
  'queued_for_payout',
  'bank_processing',
  'completed',
  'failed',
  'rejected',
  'canceled',
]);

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

function normalizeActorType(value) {
  const actorType = normalizeText(value);
  if (actorType === 'system' || actorType === 'admin' || actorType === 'owner' || actorType === 'provider') {
    return actorType;
  }
  return 'system';
}

async function insertMoneyAuditEvent(client, payload = {}) {
  const result = await client.query(
    `
    INSERT INTO public.money_audit_events (
      event_type,
      actor_type,
      actor_id,
      owner_type,
      owner_id,
      source_type,
      source_id,
      amount,
      currency,
      data
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      'KGS',
      $9::jsonb
    )
    RETURNING *
    `,
    [
      normalizeText(payload.event_type),
      normalizeActorType(payload.actor_type),
      normalizeInt(payload.actor_id),
      normalizeText(payload.owner_type),
      normalizeInt(payload.owner_id),
      normalizeText(payload.source_type),
      normalizeInt(payload.source_id),
      normalizeNumber(payload.amount),
      JSON.stringify(sanitizeJson(payload.data || {})),
    ]
  );

  return result.rows[0] || null;
}

async function createMoneyOwnerNotification(client, payload = {}) {
  const ownerType = normalizeText(payload.owner_type);

  if (!['salon', 'master'].includes(ownerType)) {
    return null;
  }

  const notificationSavepoint = 'money_notification';

  try {
    await client.query(`SAVEPOINT ${notificationSavepoint}`);

    const notification = await createNotification(client, {
      target_type: ownerType,
      target_id: String(payload.owner_id),
      owner_type: ownerType,
      owner_id: payload.owner_id,
      channel: 'in_app',
      priority: 'normal',
      title_ru: normalizeText(payload.title_ru),
      body_ru: normalizeText(payload.body_ru),
      action_type: 'money',
      action_url: null,
      status: 'sent',
      payload_json: payload.payload_json || {},
    });

    await client.query(`RELEASE SAVEPOINT ${notificationSavepoint}`);
    return notification;
  } catch (err) {
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${notificationSavepoint}`);
    } catch (rollbackError) {
      console.error('MONEY_NOTIFICATION_ERROR', {
        event_type: payload.event_type,
        owner_type: ownerType,
        owner_id: payload.owner_id,
        source_id: payload.source_id,
        error: rollbackError?.message || rollbackError,
      });
    }

    console.error('MONEY_NOTIFICATION_ERROR', {
      event_type: payload.event_type,
      owner_type: ownerType,
      owner_id: payload.owner_id,
      source_id: payload.source_id,
      error: err?.message || err,
    });

    return null;
  }
}

function buildWithdrawRequestOwnerLabel(owner = {}) {
  const ownerName = normalizeText(owner.owner_name);
  if (ownerName) {
    return ownerName;
  }

  const ownerSlug = normalizeText(owner.owner_slug);
  if (ownerSlug) {
    return ownerSlug;
  }

  const ownerType = normalizeText(owner.owner_type);
  const ownerId = normalizeInt(owner.owner_id);
  if (ownerType && ownerId) {
    return `${ownerType}/${ownerId}`;
  }

  return 'owner';
}

async function createWithdrawRequestAdminNotifications(client, request = {}, owner = {}) {
  try {
    const adminsResult = await client.query(
      `
      SELECT id, email
      FROM public.auth_users
      WHERE role = 'admin'
        AND enabled = true
      ORDER BY id ASC
      `
    );

    const adminUsers = Array.isArray(adminsResult.rows) ? adminsResult.rows : [];
    if (!adminUsers.length) {
      return [];
    }

    const ownerLabel = buildWithdrawRequestOwnerLabel(owner);
    const amount = normalizeNumber(request.amount);
    const currency = normalizeText(request.currency) || 'KGS';
    const status = normalizeText(request.status) || 'pending_validation';
    const createdNotifications = [];

    for (const admin of adminUsers) {
      const adminUserId = normalizeInt(admin.id);
      if (!adminUserId) {
        continue;
      }

      try {
        const notification = await createNotification(client, {
          notification_uid: `withdraw_request_admin_${request.id}_${adminUserId}`,
          target_type: 'auth_user',
          target_id: String(adminUserId),
          owner_type: 'admin',
          owner_id: adminUserId,
          channel: 'in_app',
          priority: 'normal',
          title_ru: 'Новая заявка на вывод',
          body_ru: `${ownerLabel} запросил вывод ${Number.isFinite(amount) ? `${amount} ${currency}` : currency}.`,
          action_type: 'money',
          action_url: '#/admin/withdrawals',
          status: 'sent',
          payload_json: {
            event_type: 'withdraw_request_admin_created',
            route: '#/admin/withdrawals',
            withdraw_request_id: normalizeInt(request.id),
            owner_type: normalizeText(request.owner_type),
            owner_id: normalizeInt(request.owner_id),
            owner_slug: normalizeText(owner.owner_slug),
            amount,
            currency,
            status,
            recipient_user_id: adminUserId,
          },
        });

        if (notification) {
          createdNotifications.push(notification);
        }
      } catch (err) {
        console.warn('MONEY_ADMIN_WITHDRAW_NOTIFICATION_ERROR', {
          event_type: 'withdraw_request_admin_created',
          admin_user_id: adminUserId,
          request_id: normalizeInt(request.id),
          owner_type: normalizeText(request.owner_type),
          owner_id: normalizeInt(request.owner_id),
          error: err?.message || err,
        });
      }
    }

    return createdNotifications;
  } catch (err) {
    console.warn('MONEY_ADMIN_WITHDRAW_NOTIFICATION_ERROR', {
      event_type: 'withdraw_request_admin_created',
      request_id: normalizeInt(request.id),
      owner_type: normalizeText(request.owner_type),
      owner_id: normalizeInt(request.owner_id),
      error: err?.message || err,
    });
    return [];
  }
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

const WITHDRAW_REQUEST_ADMIN_STATUS_LABELS = Object.freeze({
  created: 'Новая',
  pending_validation: 'Новая',
  requires_review: 'В проверке',
  locked: 'В процессе',
  queued_for_payout: 'В процессе',
  bank_processing: 'В процессе',
  completed: 'Выполнена',
  failed: 'Ошибка выплаты',
  rejected: 'Отклонена',
  canceled: 'Отклонена',
});

const WITHDRAW_REQUEST_USER_STATUS_LABELS = Object.freeze({
  created: 'Новая',
  pending_validation: 'Новая',
  requires_review: 'В процессе',
  locked: 'В процессе',
  queued_for_payout: 'В процессе',
  bank_processing: 'В процессе',
  completed: 'Выполнена',
  failed: 'Ошибка выплаты',
  rejected: 'Отклонена',
  canceled: 'Отклонена',
});

const WITHDRAW_REQUEST_ADMIN_AVAILABLE_ACTIONS = Object.freeze({
  created: ['claim', 'reject'],
  pending_validation: ['claim', 'reject'],
  requires_review: ['start_processing', 'reject', 'fail'],
  locked: ['complete', 'fail'],
  queued_for_payout: ['complete', 'fail'],
  bank_processing: ['complete', 'fail'],
  failed: ['return_to_review', 'comment'],
  completed: [],
  rejected: [],
  canceled: [],
});

function normalizeReasonText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeReasonText(item)).filter(Boolean);
  }

  if (value && typeof value === 'object') {
    return normalizeReasonText(JSON.stringify(value));
  }

  const text = normalizeText(value);
  return text ? text.toLowerCase() : '';
}

function getWithdrawRequestStatusLabel(status, mode = 'admin') {
  const normalizedStatus = normalizeText(status)?.toLowerCase();
  if (!normalizedStatus) {
    return null;
  }

  if (mode === 'user') {
    return WITHDRAW_REQUEST_USER_STATUS_LABELS[normalizedStatus] || normalizedStatus;
  }

  return WITHDRAW_REQUEST_ADMIN_STATUS_LABELS[normalizedStatus] || normalizedStatus;
}

function getWithdrawRequestAdminAvailableActions(status) {
  const normalizedStatus = normalizeText(status)?.toLowerCase();
  if (!normalizedStatus) {
    return [];
  }

  return [...(WITHDRAW_REQUEST_ADMIN_AVAILABLE_ACTIONS[normalizedStatus] || [])];
}

function buildWithdrawRequestRiskFlags(request = {}, context = {}) {
  const flags = [];
  const status = normalizeText(request.status)?.toLowerCase() || '';
  const riskLevel = normalizeText(request.risk_level)?.toLowerCase() || '';
  const decisionReasonsText = normalizeReasonText(request.decision_reasons);
  const destination = context.destination || null;
  const payoutExecution = context.payoutExecution || null;
  const ledgerEntries = Array.isArray(context.ledgerEntries) ? context.ledgerEntries : [];
  const requiresLock = ['locked', 'queued_for_payout', 'bank_processing', 'completed'].includes(status);
  const requiresPayout = ['queued_for_payout', 'bank_processing', 'completed'].includes(status);

  if (request.destination_id && !destination) {
    flags.push('DESTINATION_NOT_FOUND');
  }

  if (destination) {
    const destinationStatus = normalizeText(destination.status)?.toLowerCase() || '';
    if (destinationStatus === 'archived') {
      flags.push('DESTINATION_ARCHIVED');
    }

    if (
      normalizeText(destination.owner_type) !== normalizeText(request.owner_type) ||
      Number(destination.owner_id) !== Number(request.owner_id)
    ) {
      flags.push('OWNER_DESTINATION_MISMATCH');
    }
  }

  if (requiresLock) {
    const lockLedgerFound =
      Boolean(request.locked_ledger_group_id) ||
      ledgerEntries.some((entry) => normalizeText(entry.money_zone)?.toLowerCase() === 'locked');

    if (!lockLedgerFound) {
      flags.push('LOCK_LEDGER_MISSING');
    }
  }

  if (requiresPayout && !payoutExecution) {
    flags.push('PAYOUT_EXECUTION_MISSING');
  }

  if (status === 'failed' && normalizeText(request.failure_reason)) {
    flags.push('FAILED_WITH_REASON');
  }

  if ((status === 'canceled' || status === 'rejected') && (
    normalizeText(request.failure_reason) ||
    normalizeText(request.admin_note) ||
    decisionReasonsText
  )) {
    flags.push('REJECTED_WITH_REASON');
  }

  if (
    ['large_amount', 'high', 'critical'].includes(riskLevel) ||
    decisionReasonsText.includes('large')
  ) {
    flags.push('LARGE_AMOUNT');
  }

  return flags;
}

function decorateWithdrawRequestRow(row = {}, context = {}) {
  if (!row) {
    return null;
  }

  const riskFlags = Array.isArray(context.risk_flags)
    ? [...context.risk_flags]
    : buildWithdrawRequestRiskFlags(row, context);

  return {
    ...row,
    admin_status_label: getWithdrawRequestStatusLabel(row.status, 'admin'),
    user_status_label: getWithdrawRequestStatusLabel(row.status, 'user'),
    risk_flags: riskFlags,
  };
}

async function buildAdminWithdrawRequestsSummary(pool) {
  const summaryResult = await pool.query(
    `
    SELECT
      COALESCE(MIN(currency), 'KGS') AS currency,
      COUNT(*)::bigint AS total_count,
      COALESCE(SUM(amount), 0)::numeric AS total_amount,
      COUNT(*) FILTER (WHERE status IN ('created', 'pending_validation'))::bigint AS new_count,
      COUNT(*) FILTER (WHERE status = 'requires_review')::bigint AS review_count,
      COUNT(*) FILTER (WHERE status IN ('locked', 'queued_for_payout', 'bank_processing'))::bigint AS processing_count,
      COUNT(*) FILTER (WHERE status = 'completed')::bigint AS completed_count,
      COUNT(*) FILTER (WHERE status IN ('canceled', 'rejected'))::bigint AS rejected_count,
      COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed_count,
      COUNT(*) FILTER (
        WHERE COALESCE(LOWER(risk_level), '') IN ('large_amount', 'high', 'critical')
          OR COALESCE(decision_reasons::text, '') ILIKE '%large%'
      )::bigint AS large_amount_count,
      COUNT(*) FILTER (
        WHERE status IN ('requires_review', 'canceled', 'rejected', 'failed')
          OR COALESCE(LOWER(risk_level), '') IN ('large_amount', 'high', 'critical')
          OR COALESCE(decision_reasons::text, '') <> ''
      )::bigint AS problem_count
    FROM public.withdraw_requests
    `,
  );

  const byStatusResult = await pool.query(
    `
    SELECT
      status,
      COUNT(*)::bigint AS count,
      COALESCE(SUM(amount), 0)::numeric AS total_amount
    FROM public.withdraw_requests
    GROUP BY status
    ORDER BY CASE status
      WHEN 'created' THEN 0
      WHEN 'pending_validation' THEN 1
      WHEN 'requires_review' THEN 2
      WHEN 'locked' THEN 3
      WHEN 'queued_for_payout' THEN 4
      WHEN 'bank_processing' THEN 5
      WHEN 'completed' THEN 6
      WHEN 'canceled' THEN 7
      WHEN 'rejected' THEN 8
      WHEN 'failed' THEN 9
      ELSE 99
    END,
    status ASC
    `,
  );

  const summaryRow = summaryResult.rows[0] || {};
  const normalizeCountValue = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

  return {
    summary: {
      total_count: normalizeCountValue(summaryRow.total_count),
      total_amount: normalizeNumber(summaryRow.total_amount) || 0,
      currency: summaryRow.currency || 'KGS',
      new_count: normalizeCountValue(summaryRow.new_count),
      review_count: normalizeCountValue(summaryRow.review_count),
      processing_count: normalizeCountValue(summaryRow.processing_count),
      completed_count: normalizeCountValue(summaryRow.completed_count),
      rejected_count: normalizeCountValue(summaryRow.rejected_count),
      failed_count: normalizeCountValue(summaryRow.failed_count),
      large_amount_count: normalizeCountValue(summaryRow.large_amount_count),
      problem_count: normalizeCountValue(summaryRow.problem_count),
    },
    by_status: (byStatusResult.rows || []).map((row) => ({
      ...row,
      count: normalizeCountValue(row.count),
      total_amount: normalizeNumber(row.total_amount) || 0,
    })),
    generated_at: new Date().toISOString(),
  };
}

async function lookupWithdrawRequestOwner(pool, ownerType, ownerId) {
  const normalizedOwnerType = normalizeText(ownerType)?.toLowerCase();
  const normalizedOwnerId = normalizeInt(ownerId);

  if (!normalizedOwnerType || !normalizedOwnerId) {
    return {
      owner_type: normalizedOwnerType || null,
      owner_id: normalizedOwnerId || null,
      owner_slug: null,
      owner_name: null,
    };
  }

  if (normalizedOwnerType === 'salon') {
    const result = await pool.query(
      `
      SELECT id, slug, name
      FROM public.salons
      WHERE id = $1
      LIMIT 1
      `,
      [normalizedOwnerId],
    );
    const row = result.rows[0] || null;
    return {
      owner_type: 'salon',
      owner_id: normalizedOwnerId,
      owner_slug: row?.slug || null,
      owner_name: row?.name || null,
    };
  }

  if (normalizedOwnerType === 'master') {
    const result = await pool.query(
      `
      SELECT id, slug, name
      FROM public.masters
      WHERE id = $1
      LIMIT 1
      `,
      [normalizedOwnerId],
    );
    const row = result.rows[0] || null;
    return {
      owner_type: 'master',
      owner_id: normalizedOwnerId,
      owner_slug: row?.slug || null,
      owner_name: row?.name || null,
    };
  }

  return {
    owner_type: normalizedOwnerType,
    owner_id: normalizedOwnerId,
    owner_slug: null,
    owner_name: null,
  };
}

async function getAdminWithdrawRequestDetail(pool, id) {
  const request = await getWithdrawRequestById(pool, id);
  if (!request) {
    return null;
  }

  const owner = await lookupWithdrawRequestOwner(pool, request.owner_type, request.owner_id);

  const destinationResult = request.destination_id
    ? await pool.query(
        `
        SELECT
          id AS destination_id,
          method,
          provider_code,
          wallet_provider,
          phone,
          bank_name,
          account_masked,
          card_last4,
          account_holder,
          destination_relation,
          status,
          created_at,
          updated_at
        FROM public.withdraw_destinations
        WHERE id = $1
        LIMIT 1
        `,
        [request.destination_id],
      )
    : { rows: [] };
  const destination = destinationResult.rows[0] || null;

  const balanceResult = await pool.query(
    `
    SELECT
      provider_hold,
      pending_settlement,
      available,
      locked,
      paid_out,
      requires_review,
      updated_at
    FROM public.money_owner_balances
    WHERE owner_type = $1
      AND owner_id = $2
      AND currency = COALESCE(NULLIF($3, ''), 'KGS')
    LIMIT 1
    `,
    [request.owner_type, request.owner_id, request.currency || 'KGS'],
  );
  const balanceRow = balanceResult.rows[0] || {
    provider_hold: '0',
    pending_settlement: '0',
    available: '0',
    locked: '0',
    paid_out: '0',
    requires_review: '0',
    updated_at: null,
  };

  const payoutResult = await pool.query(
    `
    SELECT
      id,
      status,
      payout_provider,
      payout_mode,
      amount,
      currency,
      external_ref,
      bank_reference,
      submitted_at,
      completed_at,
      failed_at,
      failure_reason,
      receipt_url
    FROM public.payout_executions
    WHERE (withdraw_request_id = $1 OR id = $2)
    ORDER BY id DESC
    LIMIT 1
    `,
    [request.id, request.payout_execution_id || null],
  );
  const payoutExecution = payoutResult.rows[0] || null;

  const ledgerResult = await pool.query(
    `
    SELECT *
    FROM public.money_ledger_entries
    WHERE (source_type = 'withdraw_request' AND source_id = $1)
       OR ($2::uuid IS NOT NULL AND entry_group_id = $2::uuid)
    ORDER BY id ASC
    `,
    [request.id, request.locked_ledger_group_id || null],
  );
  const ledgerEntries = ledgerResult.rows || [];

  const auditResult = await pool.query(
    `
    SELECT *
    FROM public.money_audit_events
    WHERE source_type = 'withdraw_request'
      AND source_id = $1
    ORDER BY id ASC
    `,
    [request.id],
  );
  const auditEvents = auditResult.rows || [];

  const riskFlags = buildWithdrawRequestRiskFlags(request, {
    destination,
    payoutExecution,
    ledgerEntries,
  });

  const normalizedStatus = normalizeText(request.status)?.toLowerCase() || '';
  const requiresLock = ['locked', 'queued_for_payout', 'bank_processing', 'completed'].includes(normalizedStatus);
  const requiresPayout = ['queued_for_payout', 'bank_processing', 'completed'].includes(normalizedStatus);
  const requiresPaidOutEvidence = normalizedStatus === 'completed';
  const amountMatchesLocked = requiresLock ? Number(request.locked_amount) === Number(request.amount) : true;
  const lockLedgerFound = !requiresLock
    ? true
    : Boolean(request.locked_ledger_group_id) || ledgerEntries.some((entry) => normalizeText(entry.money_zone)?.toLowerCase() === 'locked');
  const payoutExecutionFound = !requiresPayout ? true : Boolean(payoutExecution);
  const paidOutEvidenceFound = !requiresPaidOutEvidence
    ? true
    : Boolean(payoutExecution && normalizeText(payoutExecution.status)?.toLowerCase() === 'completed') ||
      ledgerEntries.some((entry) => normalizeText(entry.money_zone)?.toLowerCase() === 'paid_out');
  const ownerMatches = owner.owner_type === 'salon' || owner.owner_type === 'master' ? Boolean(owner.owner_slug || owner.owner_name) : true;
  const destinationMatches = destination
    ? normalizeText(destination.owner_type) === normalizeText(request.owner_type) &&
      Number(destination.owner_id || request.owner_id) === Number(request.owner_id)
    : !request.destination_id;

  return {
    withdraw_request: decorateWithdrawRequestRow(request, { risk_flags: riskFlags }),
    owner,
    destination,
    balance: {
      available: balanceRow.available,
      locked: balanceRow.locked,
      paid_out: balanceRow.paid_out,
      provider_hold: balanceRow.provider_hold,
      pending_settlement: balanceRow.pending_settlement,
      requires_review: balanceRow.requires_review,
      updated_at: balanceRow.updated_at || null,
    },
    payout_execution: payoutExecution,
    ledger_entries: ledgerEntries,
    audit_events: auditEvents,
    risk_flags: riskFlags,
    reconciliation: {
      owner_matches: ownerMatches,
      destination_matches: destinationMatches,
      amount_matches_locked: amountMatchesLocked,
      lock_ledger_found: lockLedgerFound,
      payout_execution_found: payoutExecutionFound,
      paid_out_evidence_found: paidOutEvidenceFound,
      has_mismatch: [ownerMatches, destinationMatches, amountMatchesLocked, lockLedgerFound, payoutExecutionFound, paidOutEvidenceFound].some((value) => value === false),
    },
    admin_available_actions: getWithdrawRequestAdminAvailableActions(request.status),
    generated_at: new Date().toISOString(),
  };
}

function validateOwner(ownerType, ownerId) {
  const normalizedOwnerType = normalizeText(ownerType);
  const normalizedOwnerId = normalizeInt(ownerId);

  if (!normalizedOwnerType || !ALLOWED_OWNER_TYPES.has(normalizedOwnerType)) {
    const error = new Error('Invalid owner_type');
    error.code = 'WITHDRAW_REQUEST_OWNER_TYPE_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!normalizedOwnerId || normalizedOwnerId <= 0) {
    const error = new Error('Invalid owner_id');
    error.code = 'WITHDRAW_REQUEST_OWNER_ID_INVALID';
    error.statusCode = 400;
    throw error;
  }

  return { owner_type: normalizedOwnerType, owner_id: normalizedOwnerId };
}

async function listWithdrawRequests(pool, ownerType, ownerId, filters = {}) {
  const owner = validateOwner(ownerType, ownerId);
  const where = ['owner_type = $1', 'owner_id = $2'];
  const values = [owner.owner_type, owner.owner_id];
  let index = 3;

  if (filters.status) {
    where.push(`status = $${index++}`);
    values.push(normalizeText(filters.status));
  }

  if (filters.destination_id !== undefined && filters.destination_id !== null && filters.destination_id !== '') {
    where.push(`destination_id = $${index++}`);
    values.push(normalizeInt(filters.destination_id));
  }

  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index++;
  values.push(offset);
  const offsetIndex = index++;

  const result = await pool.query(
    `
    SELECT *
    FROM public.withdraw_requests
    WHERE ${where.join(' AND ')}
    ORDER BY id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

async function getWithdrawRequestById(pool, id) {
  const requestId = normalizeInt(id);
  if (!requestId || requestId <= 0) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT *
    FROM public.withdraw_requests
    WHERE id = $1
    LIMIT 1
    `,
    [requestId]
  );

  return result.rows[0] || null;
}

async function createWithdrawRequest(pool, ownerType, ownerId, input = {}, actor = {}) {
  assertMoneyCoreWriteAllowed();

  const owner = validateOwner(ownerType, ownerId);
  const amount = normalizeNumber(input.amount);
  const currency = normalizeText(input.currency) || 'KGS';
  const creationMode = normalizeText(input.creation_mode) || 'manual';
  const idempotencyKey = normalizeText(input.idempotency_key);
  const destinationId = normalizeInt(input.destination_id);

  if (currency !== 'KGS') {
    const error = new Error('Invalid currency');
    error.code = 'WITHDRAW_REQUEST_CURRENCY_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!amount || amount <= 0) {
    const error = new Error('amount must be greater than 0');
    error.code = 'WITHDRAW_REQUEST_AMOUNT_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!ALLOWED_CREATION_MODES.has(creationMode)) {
    const error = new Error('Invalid creation_mode');
    error.code = 'WITHDRAW_REQUEST_CREATION_MODE_INVALID';
    error.statusCode = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (idempotencyKey) {
      const existingResult = await client.query(
        `
        SELECT *
        FROM public.withdraw_requests
        WHERE idempotency_key = $1
        LIMIT 1
        `,
        [idempotencyKey]
      );

      if (existingResult.rows[0]) {
        await client.query('COMMIT');
        return {
          already_exists: true,
          request: existingResult.rows[0],
          ledger: null,
        };
      }
    }

    let resolvedDestinationId = null;
    if (destinationId !== null) {
      const destinationResult = await client.query(
        `
        SELECT id, owner_type, owner_id, status
        FROM public.withdraw_destinations
        WHERE id = $1
        LIMIT 1
        `,
        [destinationId]
      );

      const destination = destinationResult.rows[0];
      if (
        !destination ||
        destination.owner_type !== owner.owner_type ||
        Number(destination.owner_id) !== owner.owner_id ||
        ['archived', 'blocked'].includes(String(destination.status || '').trim().toLowerCase())
      ) {
        const error = new Error('Invalid withdraw destination');
        error.code = 'WITHDRAW_REQUEST_DESTINATION_INVALID';
        error.statusCode = 400;
        throw error;
      }

      resolvedDestinationId = destination.id;
    }

    const availableBalanceResult = await client.query(
      `
      SELECT available
      FROM public.money_owner_balances
      WHERE owner_type = $1
        AND owner_id = $2
        AND currency = 'KGS'
      LIMIT 1
      `,
      [owner.owner_type, owner.owner_id]
    );

    const availableSnapshot = availableBalanceResult.rows[0] ? Number(availableBalanceResult.rows[0].available) : 0;

    if (amount > availableSnapshot) {
      const error = new Error('Insufficient available balance');
      error.code = 'INSUFFICIENT_AVAILABLE_BALANCE';
      error.statusCode = 400;
      throw error;
    }

    const requestInsert = await client.query(
      `
      INSERT INTO public.withdraw_requests (
        legacy_withdraw_id,
        owner_type,
        owner_id,
        amount,
        currency,
        status,
        creation_mode,
        decision,
        risk_level,
        decision_reasons,
        destination_id,
        available_snapshot,
        locked_amount,
        locked_ledger_group_id,
        payout_execution_id,
        expected_payout_date,
        idempotency_key,
        rules_version,
        created_by_type,
        created_by_id,
        created_at,
        updated_at,
        locked_at,
        completed_at,
        failed_at,
        canceled_at,
        rejected_at,
        failure_reason,
        admin_note
      ) VALUES (
        NULL,
        $1,
        $2,
        $3,
        'KGS',
        'pending_validation',
        $4,
        'auto_approve',
        'green',
        '[]'::jsonb,
        $5,
        $6,
        0,
        NULL,
        NULL,
        NULL,
        $7,
        NULL,
        $8,
        $9,
        now(),
        now(),
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL
      )
      RETURNING *
      `,
      [
        owner.owner_type,
        owner.owner_id,
        amount,
        creationMode,
        resolvedDestinationId,
        availableSnapshot,
        idempotencyKey,
        normalizeText(input.created_by_type) || 'owner',
        normalizeInt(input.created_by_id),
      ]
    );

    const request = requestInsert.rows[0];

    const entryGroupId = request.locked_ledger_group_id || randomUUID();
    const sanitizedMetadata = sanitizeJson(input.metadata_json ?? input.metadata ?? {});

    const ledgerEntries = [];
    for (const entry of [
      {
        owner_type: owner.owner_type,
        owner_id: owner.owner_id,
        money_zone: 'available',
        direction: 'debit',
        amount,
      },
      {
        owner_type: owner.owner_type,
        owner_id: owner.owner_id,
        money_zone: 'locked',
        direction: 'credit',
        amount,
      },
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
          'withdraw_request',
          $7,
          $8,
          $9,
          $10,
          $11,
          $12::jsonb,
          now()
        )
        RETURNING *
        `,
        [
          entryGroupId,
          entry.owner_type,
          entry.owner_id,
          entry.money_zone,
          entry.direction,
          entry.amount,
          request.id,
          entry.money_zone === 'available' ? 'withdraw lock available' : 'withdraw lock locked',
          null,
          normalizeText(input.created_by_type) || 'owner',
          normalizeInt(input.created_by_id),
          JSON.stringify(sanitizedMetadata),
        ]
      );

      ledgerEntries.push(insertResult.rows[0]);
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
      [owner.owner_type, owner.owner_id]
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

    const balanceUpsertResult = await client.query(
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
        owner.owner_type,
        owner.owner_id,
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

    const updatedRequestResult = await client.query(
      `
      UPDATE public.withdraw_requests
      SET
        status = 'locked',
        locked_amount = $2,
        locked_ledger_group_id = $3::uuid,
        locked_at = now(),
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [
        request.id,
        amount,
        entryGroupId,
      ]
    );

    await insertMoneyAuditEvent(client, {
      event_type: 'withdraw_request_locked',
      actor_type: actor.user_type,
      actor_id: actor.user_id,
      owner_type: owner.owner_type,
      owner_id: owner.owner_id,
      source_type: 'withdraw_request',
      source_id: (updatedRequestResult.rows[0] || request).id,
      amount,
      data: {
        request: updatedRequestResult.rows[0] || request,
        available_snapshot: availableSnapshot,
        destination_id: resolvedDestinationId,
        creation_mode: creationMode,
        idempotency_key: idempotencyKey,
        locked_ledger_group_id: entryGroupId,
        ledger_entry_ids: ledgerEntries.map((row) => row.id),
        balance: balanceUpsertResult.rows[0],
      },
    });

    const withdrawRequestLockedTemplate = buildWithdrawRequestLockedNotificationTemplate({
      amount,
      currency,
    });

    await createMoneyOwnerNotification(client, {
      event_type: 'withdraw_request_locked',
      source_type: 'withdraw_request',
      source_id: (updatedRequestResult.rows[0] || request).id,
      owner_type: owner.owner_type,
      owner_id: owner.owner_id,
      ...withdrawRequestLockedTemplate,
      payload_json: {
        event_type: 'withdraw_request_locked',
        source_type: 'withdraw_request',
        source_id: (updatedRequestResult.rows[0] || request).id,
        owner_type: owner.owner_type,
        owner_id: owner.owner_id,
        amount,
        currency,
        status: 'locked',
      },
    });

    await createWithdrawRequestAdminNotifications(client, updatedRequestResult.rows[0] || request, owner);

    await client.query('COMMIT');

    return {
      request: updatedRequestResult.rows[0] || request,
      ledger: {
        entry_group_id: entryGroupId,
        entries: ledgerEntries,
        balances: [balanceUpsertResult.rows[0]],
      },
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
  decorateWithdrawRequestRow,
  buildAdminWithdrawRequestsSummary,
  getAdminWithdrawRequestDetail,
  listWithdrawRequests,
  getWithdrawRequestById,
  createWithdrawRequest,
};
