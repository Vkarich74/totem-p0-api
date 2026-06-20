'use strict';

import express from 'express';
import AdminRuntimeGuard from '../../middleware/AdminRuntimeGuard.js';
import {
  getMoneyCoreFlags,
  assertMoneyCoreWriteAllowed,
  assertProviderEventsEnabled,
  assertProviderSettlementsEnabled,
  assertWithdrawDestinationsWriteEnabled,
  assertWithdrawRequestsEnabled,
  assertPayoutExecutionsEnabled,
  assertLedgerMovementsEnabled,
  assertReconciliationEnabled,
} from '../../money-core/config.js';
import { buildOwnerMoneyCoreSummary } from '../../money-core/balances.service.js';
import {
  createProviderEvent,
  listProviderEvents,
  getProviderEventById,
} from '../../money-core/providerEvents.service.js';
import {
  createManualSettlement,
  listProviderSettlements,
  getProviderSettlementById,
  confirmBankReceived,
  failProviderSettlement,
} from '../../money-core/settlements.service.js';
import {
  listSplitAllocations,
  getSplitAllocationById,
  previewSettlementSplit,
  createSettlementSplitAllocations,
} from '../../money-core/split.service.js';
import {
  listMoneyLedgerEntries,
  getMoneyLedgerEntryById,
  getOwnerMoneyLedger,
  rebuildOwnerBalanceFromLedger,
  createMoneyLedgerMovement,
} from '../../money-core/ledger.service.js';
import {
  listDestinationProviders,
  listWithdrawDestinations,
  getWithdrawDestinationById,
  createWithdrawDestination,
  updateWithdrawDestination,
  archiveWithdrawDestination,
  getWithdrawSettings,
  upsertWithdrawSettings,
} from '../../money-core/withdrawDestinations.service.js';
import {
  listOwnerQrDestinations,
  getActiveOwnerQrDestination,
  createOwnerQrDestination,
  updateOwnerQrDestination,
  deactivateOwnerQrDestination,
  attachOwnerQrDestinationImage,
  deleteOwnerQrDestinationImage,
} from '../../money-core/ownerQrDestinations.service.js';
import {
  createOwnerQrImageUploadMiddleware,
  normalizeOwnerQrImageUploadError,
} from '../../services/ownerQrImageStorage.js';
import {
  listWithdrawRequests,
  getWithdrawRequestById,
  decorateWithdrawRequestRow,
  attachOwnerSafeWithdrawRequestSummaries,
  buildAdminWithdrawRequestsSummary,
  getAdminWithdrawRequestDetail,
  createWithdrawRequest,
} from '../../money-core/withdrawRequests.service.js';
import {
  listPayoutExecutions,
  getPayoutExecutionById,
  createPayoutExecution,
  submitManualPayoutExecution,
  completePayoutExecution,
  failPayoutExecution,
} from '../../money-core/payoutExecutions.service.js';
import {
  listReconciliationRuns,
  getReconciliationRunById,
  listReconciliationMismatches,
  runReconciliation,
  resolveReconciliationMismatch,
} from '../../money-core/reconciliation.service.js';
import {
  listOwnerObligations,
} from '../../money-core/ownerQrObligations.service.js';
import {
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
} from '../../money-core/adminFinance.service.js';

const MONEY_CORE_TABLES = Object.freeze([
  'money_providers',
  'provider_events',
  'provider_settlements',
  'provider_settlement_items',
  'money_ledger_entries',
  'money_owner_balances',
  'money_split_rules',
  'money_split_allocations',
  'withdraw_destinations',
  'destination_providers',
  'withdraw_settings',
  'withdraw_requests',
  'payout_executions',
  'money_reconciliation_runs',
  'money_reconciliation_mismatches',
  'money_audit_events',
  'money_receipts',
]);

const LEGACY_MAP = Object.freeze({
  moneyCore: 'read-only diagnostics only',
  payments: 'legacy finance surface, not modified here',
  withdraws: 'legacy withdraw surface, not modified here',
  payouts: 'legacy payout surface, not modified here',
  settlements: 'legacy settlement surface, not modified here',
});

function safeJson(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

function runMiddleware(req, res, middleware) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
}

async function resolveMoneyCoreOwnerBySlug(pool, ownerType, slug) {
  const normalizedOwnerType = String(ownerType || '').trim().toLowerCase();
  const normalizedSlug = String(slug || '').trim();

  if (normalizedOwnerType !== 'salon' && normalizedOwnerType !== 'master') {
    return {
      ok: false,
      statusCode: 400,
      error: 'OWNER_TYPE_INVALID',
    };
  }

  if (!normalizedSlug) {
    return {
      ok: false,
      statusCode: 400,
      error: 'SLUG_REQUIRED',
    };
  }

  const ownerQuery =
    normalizedOwnerType === 'salon'
      ? await pool.query(
          'SELECT id, slug, name, enabled, status FROM public.salons WHERE slug = $1 LIMIT 1',
          [normalizedSlug]
        )
      : await pool.query(
          'SELECT id, slug, name, active FROM public.masters WHERE slug = $1 LIMIT 1',
          [normalizedSlug]
        );

  const ownerRow = ownerQuery.rows[0] || null;

  if (!ownerRow) {
    return {
      ok: false,
      statusCode: 404,
      error: 'OWNER_NOT_FOUND',
    };
  }

  return {
    ok: true,
    owner_type: normalizedOwnerType,
    owner_id: ownerRow.id,
    owner: ownerRow,
  };
}

async function resolveMoneyCoreOwnerById(pool, ownerType, ownerId) {
  const normalizedOwnerType = String(ownerType || '').trim().toLowerCase();
  const normalizedOwnerId = Number.parseInt(String(ownerId || '').trim(), 10);

  if (!normalizedOwnerType || !['salon', 'master', 'system'].includes(normalizedOwnerType)) {
    return {
      ok: false,
      statusCode: 400,
      error: 'OWNER_TYPE_INVALID',
    };
  }

  if (!Number.isInteger(normalizedOwnerId) || normalizedOwnerId <= 0) {
    return {
      ok: false,
      statusCode: 400,
      error: 'OWNER_ID_REQUIRED',
    };
  }

  if (normalizedOwnerType === 'system') {
    if (normalizedOwnerId !== 900001) {
      return {
        ok: false,
        statusCode: 404,
        error: 'OWNER_NOT_FOUND',
      };
    }

    return {
      ok: true,
      owner_type: 'system',
      owner_id: 900001,
      owner: { id: 900001, owner_type: 'system' },
    };
  }

  const ownerQuery =
    normalizedOwnerType === 'salon'
      ? await pool.query(
          'SELECT id, slug, name, enabled, status FROM public.salons WHERE id = $1 LIMIT 1',
          [normalizedOwnerId]
        )
      : await pool.query(
          'SELECT id, slug, name, active FROM public.masters WHERE id = $1 LIMIT 1',
          [normalizedOwnerId]
        );

  const ownerRow = ownerQuery.rows[0] || null;

  if (!ownerRow) {
    return {
      ok: false,
      statusCode: 404,
      error: 'OWNER_NOT_FOUND',
    };
  }

  return {
    ok: true,
    owner_type: normalizedOwnerType,
    owner_id: ownerRow.id,
    owner: ownerRow,
  };
}

function getIdentityOwnerIds(identity, ownerType) {
  const ids = new Set();

  if (!identity || !ownerType) {
    return ids;
  }

  const normalizedOwnerType = String(ownerType || '').trim().toLowerCase();

  const sources = [];
  if (Array.isArray(identity?.ownership)) {
    sources.push(...identity.ownership);
  }

  for (const item of sources) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const itemOwnerType = String(item.owner_type || item.type || '').trim().toLowerCase();
    if (itemOwnerType !== normalizedOwnerType) {
      continue;
    }

    const rawId = item.owner_id ?? item.salon_id ?? item.master_id ?? item.id;
    const parsedId = Number.parseInt(String(rawId || '').trim(), 10);
    if (Number.isInteger(parsedId) && parsedId > 0) {
      ids.add(parsedId);
    }
  }

  return ids;
}

function hasMoneyCoreOwnerAccess(req, ownerType, ownerId) {
  if (req?.auth?.role === 'system') {
    return true;
  }

  const normalizedOwnerType = String(ownerType || '').trim().toLowerCase();
  const normalizedOwnerId = Number.parseInt(String(ownerId || '').trim(), 10);

  if (!normalizedOwnerType || !Number.isInteger(normalizedOwnerId) || normalizedOwnerId <= 0) {
    return false;
  }

  if (normalizedOwnerType === 'system') {
    return false;
  }

  const identityOwnerIds = getIdentityOwnerIds(req?.identity, normalizedOwnerType);
  const authOwnerIds = getIdentityOwnerIds(req?.auth, normalizedOwnerType);

  return identityOwnerIds.has(normalizedOwnerId) || authOwnerIds.has(normalizedOwnerId);
}

function hasMoneyCorePrivilegedAccess(req) {
  const role = String(req?.auth?.role || '').trim().toLowerCase();
  return role === 'system' || role === 'owner';
}

function requireMoneyCoreAuth(res, req) {
  if (!req?.auth || !req.auth.user_id || !req.auth.role) {
    safeJson(res, 401, {
      ok: false,
      error: 'UNAUTHORIZED',
    });
    return false;
  }

  return true;
}

function requireMoneyCorePrivilegedAccess(res, req) {
  if (!requireMoneyCoreAuth(res, req)) {
    return false;
  }

  if (!hasMoneyCorePrivilegedAccess(req)) {
    safeJson(res, 403, {
      ok: false,
      error: 'MONEY_CORE_PRIVILEGED_ACCESS_REQUIRED',
    });
    return false;
  }

  return true;
}

function requireMoneyCoreOwnerAccess(res, req, ownerType, ownerId) {
  if (!requireMoneyCoreAuth(res, req)) {
    return false;
  }

  if (hasMoneyCorePrivilegedAccess(req)) {
    return true;
  }

  if (!hasMoneyCoreOwnerAccess(req, ownerType, ownerId)) {
    safeJson(res, 403, {
      ok: false,
      error: 'MONEY_CORE_OWNER_ACCESS_REQUIRED',
    });
    return false;
  }

  return true;
}

function requireMoneyCorePrivilegedWriteAccess(res, req) {
  if (!requireMoneyCoreAuth(res, req)) {
    return false;
  }

  if (!hasMoneyCorePrivilegedAccess(req)) {
    safeJson(res, 403, {
      ok: false,
      error: 'MONEY_CORE_PRIVILEGED_ACCESS_REQUIRED',
    });
    return false;
  }

  return true;
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
      $1, $2, $3, $4, $5, $6, $7, $8, 'KGS', $9::jsonb
    )
    RETURNING *
    `,
    [
      String(payload.event_type || '').trim(),
      String(payload.actor_type || 'system').trim().toLowerCase(),
      Number.isFinite(Number(payload.actor_id)) ? Number(payload.actor_id) : null,
      String(payload.owner_type || '').trim().toLowerCase() || null,
      Number.isFinite(Number(payload.owner_id)) ? Number(payload.owner_id) : null,
      String(payload.source_type || '').trim().toLowerCase() || null,
      Number.isFinite(Number(payload.source_id)) ? Number(payload.source_id) : null,
      Number.isFinite(Number(payload.amount)) ? Number(payload.amount) : null,
      JSON.stringify(payload.data && typeof payload.data === 'object' ? payload.data : {}),
    ]
  );

  return result.rows[0] || null;
}

function normalizeWithdrawRequestAdminActionText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function buildWithdrawRequestAdminActionError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

const FORBIDDEN_START_PROCESSING_BODY_FIELDS = new Set([
  'external_ref',
  'bank_reference',
  'receipt_url',
  'completed_at',
  'failure_reason',
]);

function hasForbiddenStartProcessingBodyFields(body = {}) {
  if (!body || typeof body !== 'object') {
    return false;
  }

  return Array.from(FORBIDDEN_START_PROCESSING_BODY_FIELDS).some((field) =>
    Object.prototype.hasOwnProperty.call(body, field)
  );
}

const FORBIDDEN_COMPLETE_BODY_FIELDS = new Set([
  'failure_reason',
  'completed_at',
  'failed_at',
  'payout_provider',
  'payout_mode',
  'payout_execution_id',
  'metadata_json',
]);

const FORBIDDEN_FAIL_BODY_FIELDS = new Set([
  'external_ref',
  'bank_reference',
  'receipt_url',
  'completed_at',
  'failed_at',
  'payout_provider',
  'payout_mode',
  'payout_execution_id',
  'metadata_json',
]);

function hasForbiddenWithdrawRequestPayoutFields(body = {}, forbiddenFields = FORBIDDEN_COMPLETE_BODY_FIELDS) {
  if (!body || typeof body !== 'object') {
    return false;
  }

  return Array.from(forbiddenFields).some((field) =>
    Object.prototype.hasOwnProperty.call(body, field)
  );
}

function sendWithdrawRequestStartProcessingError(res, err) {
  if (!err) {
    return null;
  }

  if (
    String(err.code || '').startsWith('MONEY_CORE_') ||
    String(err.code || '').startsWith('WITHDRAW_REQUEST_') ||
    String(err.code || '').startsWith('PAYOUT_') ||
    err.code === 'PAYOUT_PROOF_NOT_ALLOWED_AT_START_PROCESSING' ||
    err.statusCode
  ) {
    return safeJson(res, err.statusCode || 400, {
      ok: false,
      error: err.code || 'WITHDRAW_REQUEST_START_PROCESSING_FAILED',
      message: err.message,
    });
  }

  return null;
}

function sendWithdrawRequestPayoutActionError(res, err) {
  if (!err) {
    return null;
  }

  const code = String(err.code || '');
  if (code.startsWith('WITHDRAW_REQUEST_') || code.startsWith('PAYOUT_') || code.startsWith('MONEY_CORE_')) {
    return safeJson(res, err.statusCode || (code.startsWith('MONEY_CORE_') ? 403 : 400), {
      ok: false,
      error: err.code || 'WITHDRAW_REQUEST_PAYOUT_ACTION_FAILED',
      message: err.message,
    });
  }

  if (err.statusCode) {
    return safeJson(res, err.statusCode, {
      ok: false,
      error: err.code || 'WITHDRAW_REQUEST_PAYOUT_ACTION_FAILED',
      message: err.message,
    });
  }

  return null;
}

async function processAdminWithdrawRequestAction(pool, requestId, action, body = {}, actor = {}) {
  const normalizedAction = normalizeWithdrawRequestAdminActionText(action)?.toLowerCase();
  const normalizedRequestId = Number.parseInt(String(requestId || '').trim(), 10);

  if (!Number.isFinite(normalizedRequestId) || normalizedRequestId <= 0) {
    throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_ID_INVALID', 'Withdraw request id is invalid', 400);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const requestResult = await client.query(
      `
      SELECT *
      FROM public.withdraw_requests
      WHERE id = $1
      FOR UPDATE
      `,
      [normalizedRequestId]
    );

    const currentRequest = requestResult.rows[0] || null;

    if (!currentRequest) {
      throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_NOT_FOUND', 'Withdraw request not found', 404);
    }

    const currentStatus = normalizeWithdrawRequestAdminActionText(currentRequest.status)?.toLowerCase() || '';
    const adminUserId = Number.isFinite(Number(actor?.user_id)) ? Number(actor.user_id) : null;

    if (normalizedAction === 'comment') {
      const comment = normalizeWithdrawRequestAdminActionText(body?.comment);
      if (!comment) {
        throw buildWithdrawRequestAdminActionError('COMMENT_REQUIRED', 'Comment is required', 400);
      }

      const currentNote = normalizeWithdrawRequestAdminActionText(currentRequest.admin_note);
      if (currentNote === comment) {
        await client.query('COMMIT');
        return {
          action: 'comment',
          audit_event_id: null,
          request: decorateWithdrawRequestRow(currentRequest),
        };
      }

      const updateResult = await client.query(
        `
        UPDATE public.withdraw_requests
        SET
          admin_note = $2,
          updated_at = now()
        WHERE id = $1
        RETURNING *
        `,
        [currentRequest.id, comment]
      );

      const updatedRequest = updateResult.rows[0] || currentRequest;
      const auditEvent = await insertMoneyAuditEvent(client, {
        event_type: 'withdraw_request_admin_comment_added',
        actor_type: 'admin',
        actor_id: adminUserId,
        owner_type: updatedRequest.owner_type,
        owner_id: updatedRequest.owner_id,
        source_type: 'withdraw_request',
        source_id: updatedRequest.id,
        amount: updatedRequest.amount,
        data: {
          action: 'comment',
          comment,
          previous_status: currentStatus,
          previous_admin_note: currentNote,
        },
      });

      await client.query('COMMIT');

      return {
        action: 'comment',
        audit_event_id: auditEvent?.id || null,
        request: decorateWithdrawRequestRow(updatedRequest),
      };
    }

    if (normalizedAction === 'claim') {
      const allowedStatuses = new Set(['created', 'pending_validation']);

      if (currentStatus === 'requires_review') {
        await client.query('COMMIT');
        return {
          action: 'claim',
          audit_event_id: null,
          request: decorateWithdrawRequestRow(currentRequest),
        };
      }

      if (!allowedStatuses.has(currentStatus)) {
        throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_INVALID_STATUS', 'Withdraw request status is not valid for claim', 409);
      }

      const updateResult = await client.query(
        `
        UPDATE public.withdraw_requests
        SET
          status = 'requires_review',
          updated_at = now()
        WHERE id = $1
          AND status = ANY($2::text[])
        RETURNING *
        `,
        [currentRequest.id, ['created', 'pending_validation']]
      );

      const updatedRequest = updateResult.rows[0] || null;
      if (!updatedRequest) {
        throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_INVALID_STATUS', 'Withdraw request status is not valid for claim', 409);
      }

      const auditEvent = await insertMoneyAuditEvent(client, {
        event_type: 'withdraw_request_admin_claimed',
        actor_type: 'admin',
        actor_id: adminUserId,
        owner_type: updatedRequest.owner_type,
        owner_id: updatedRequest.owner_id,
        source_type: 'withdraw_request',
        source_id: updatedRequest.id,
        amount: updatedRequest.amount,
        data: {
          action: 'claim',
          previous_status: currentStatus,
          next_status: 'requires_review',
        },
      });

      await client.query('COMMIT');

      return {
        action: 'claim',
        audit_event_id: auditEvent?.id || null,
        request: decorateWithdrawRequestRow(updatedRequest),
      };
    }

    if (normalizedAction === 'reject') {
      const reason = normalizeWithdrawRequestAdminActionText(body?.reason);
      if (!reason) {
        throw buildWithdrawRequestAdminActionError('REASON_REQUIRED', 'Reason is required', 400);
      }

      const adminNote = normalizeWithdrawRequestAdminActionText(body?.admin_note);
      if (currentStatus === 'rejected') {
        await client.query('COMMIT');
        return {
          action: 'reject',
          audit_event_id: null,
          request: decorateWithdrawRequestRow(currentRequest),
        };
      }

      const allowedStatuses = new Set(['created', 'pending_validation', 'requires_review']);
      if (!allowedStatuses.has(currentStatus)) {
        throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_INVALID_STATUS', 'Withdraw request status is not valid for reject', 409);
      }

      const updateResult = await client.query(
        `
        UPDATE public.withdraw_requests
        SET
          status = 'rejected',
          rejected_at = now(),
          failure_reason = $2,
          admin_note = COALESCE(NULLIF($3, ''), admin_note),
          updated_at = now()
        WHERE id = $1
          AND status = ANY($4::text[])
        RETURNING *
        `,
        [currentRequest.id, reason, adminNote, ['created', 'pending_validation', 'requires_review']]
      );

      const updatedRequest = updateResult.rows[0] || null;
      if (!updatedRequest) {
        throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_INVALID_STATUS', 'Withdraw request status is not valid for reject', 409);
      }

      const auditEvent = await insertMoneyAuditEvent(client, {
        event_type: 'withdraw_request_admin_rejected',
        actor_type: 'admin',
        actor_id: adminUserId,
        owner_type: updatedRequest.owner_type,
        owner_id: updatedRequest.owner_id,
        source_type: 'withdraw_request',
        source_id: updatedRequest.id,
        amount: updatedRequest.amount,
        data: {
          action: 'reject',
          reason,
          admin_note: adminNote,
          previous_status: currentStatus,
          next_status: 'rejected',
        },
      });

      await client.query('COMMIT');

      return {
        action: 'reject',
        audit_event_id: auditEvent?.id || null,
        request: decorateWithdrawRequestRow(updatedRequest),
      };
    }

    throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_ACTION_INVALID', 'Withdraw request action is invalid', 400);
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

async function processAdminWithdrawRequestStartProcessing(pool, requestId, body = {}, actor = {}) {
  const normalizedRequestId = Number.parseInt(String(requestId || '').trim(), 10);
  if (!Number.isFinite(normalizedRequestId) || normalizedRequestId <= 0) {
    throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_ID_INVALID', 'Withdraw request id is invalid', 400);
  }

  if (hasForbiddenStartProcessingBodyFields(body)) {
    const error = new Error('Payout proof fields are not allowed at start-processing');
    error.code = 'PAYOUT_PROOF_NOT_ALLOWED_AT_START_PROCESSING';
    error.statusCode = 400;
    throw error;
  }

  const currentRequestResult = await pool.query(
    `
    SELECT *
    FROM public.withdraw_requests
    WHERE id = $1
    LIMIT 1
    `,
    [normalizedRequestId]
  );

  const currentRequest = currentRequestResult.rows[0] || null;
  if (!currentRequest) {
    throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_NOT_FOUND', 'Withdraw request not found', 404);
  }

  const currentStatus = normalizeWithdrawRequestAdminActionText(currentRequest.status)?.toLowerCase() || '';
  const normalizedPayoutProvider = normalizeWithdrawRequestAdminActionText(body?.payout_provider);
  const adminNote = normalizeWithdrawRequestAdminActionText(body?.internal_note) || normalizeWithdrawRequestAdminActionText(body?.reason);
  const adminUserId = Number.isFinite(Number(actor?.user_id)) ? Number(actor.user_id) : null;

  if (['completed', 'failed', 'canceled', 'rejected'].includes(currentStatus)) {
    throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_INVALID_STATUS', 'Withdraw request status is not valid for start_processing', 409);
  }

  let effectiveRequest = currentRequest;
  let existingPayout = null;

  if (effectiveRequest.payout_execution_id) {
    const payoutResult = await pool.query(
      `
      SELECT *
      FROM public.payout_executions
      WHERE id = $1
      LIMIT 1
      `,
      [effectiveRequest.payout_execution_id]
    );
    existingPayout = payoutResult.rows[0] || null;
  }

  if (existingPayout) {
    const payoutStatus = normalizeWithdrawRequestAdminActionText(existingPayout.status)?.toLowerCase() || '';
    if (['submitted', 'processing', 'completed', 'failed'].includes(payoutStatus)) {
      const detail = await getAdminWithdrawRequestDetail(pool, normalizedRequestId);
      if (!detail) {
        throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_NOT_FOUND', 'Withdraw request not found', 404);
      }

      return {
        action: 'start_processing',
        audit_event_id: null,
        request: detail.withdraw_request,
        payout_execution: detail.payout_execution,
        detail,
      };
    }
  }

  if (currentStatus === 'requires_review' && !existingPayout) {
    if (
      !Number(currentRequest.locked_amount || 0) ||
      !currentRequest.locked_ledger_group_id ||
      !currentRequest.destination_id ||
      currentRequest.payout_execution_id
    ) {
      throw buildWithdrawRequestAdminActionError(
        'WITHDRAW_REQUEST_START_PROCESSING_LOCK_EVIDENCE_REQUIRED',
        'Withdraw request lock evidence is required for start_processing',
        409
      );
    }

    const lockResult = await pool.query(
      `
      UPDATE public.withdraw_requests
      SET
        status = 'locked',
        updated_at = now()
      WHERE id = $1
        AND status = 'requires_review'
        AND locked_amount > 0
        AND locked_ledger_group_id IS NOT NULL
        AND destination_id IS NOT NULL
        AND payout_execution_id IS NULL
      RETURNING *
      `,
      [normalizedRequestId]
    );

    effectiveRequest = lockResult.rows[0] || effectiveRequest;
    if (normalizeWithdrawRequestAdminActionText(effectiveRequest.status)?.toLowerCase() === 'requires_review') {
      const refreshedResult = await pool.query(
        `
        SELECT *
        FROM public.withdraw_requests
        WHERE id = $1
        LIMIT 1
        `,
        [normalizedRequestId]
      );
      effectiveRequest = refreshedResult.rows[0] || effectiveRequest;

      if (normalizeWithdrawRequestAdminActionText(effectiveRequest.status)?.toLowerCase() === 'requires_review') {
        throw buildWithdrawRequestAdminActionError(
          'WITHDRAW_REQUEST_START_PROCESSING_LOCK_EVIDENCE_REQUIRED',
          'Withdraw request lock evidence is required for start_processing',
          409
        );
      }
    }
  }

  if (!existingPayout) {
    if (!['locked', 'queued_for_payout'].includes(normalizeWithdrawRequestAdminActionText(effectiveRequest.status)?.toLowerCase() || '')) {
      throw buildWithdrawRequestAdminActionError(
        'WITHDRAW_REQUEST_INVALID_STATUS',
        'Withdraw request status is not valid for start_processing',
        409
      );
    }

    existingPayout = await createPayoutExecution(pool, {
      withdraw_request_id: normalizedRequestId,
    }, {
      user_id: adminUserId,
      user_type: 'admin',
    });
  }

  const payoutStatus = normalizeWithdrawRequestAdminActionText(existingPayout?.status)?.toLowerCase() || '';
  let submittedPayout = existingPayout;

  if (payoutStatus === 'draft') {
    submittedPayout = await submitManualPayoutExecution(pool, existingPayout.id, {
      payout_provider: normalizedPayoutProvider,
    }, {
      user_id: adminUserId,
      user_type: 'admin',
    });
  } else if (!['submitted', 'processing', 'completed', 'failed'].includes(payoutStatus)) {
    throw buildWithdrawRequestAdminActionError(
      'PAYOUT_STATUS_INVALID',
      'Payout execution status is not valid for start_processing',
      409
    );
  }

  const detail = await getAdminWithdrawRequestDetail(pool, normalizedRequestId);
  if (!detail) {
    throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_NOT_FOUND', 'Withdraw request not found', 404);
  }

  const auditEvent = await insertMoneyAuditEvent(pool, {
    event_type: 'withdraw_request_admin_start_processing',
    actor_type: 'admin',
    actor_id: adminUserId,
    owner_type: detail.withdraw_request.owner_type,
    owner_id: detail.withdraw_request.owner_id,
    source_type: 'withdraw_request',
    source_id: detail.withdraw_request.id,
    amount: detail.withdraw_request.amount,
    data: {
      previous_status: currentStatus,
      next_status: 'bank_processing',
      payout_execution_id: detail.payout_execution?.id || submittedPayout?.id || existingPayout?.id || null,
      payout_provider: normalizedPayoutProvider,
      internal_note: adminNote,
    },
  });

  return {
    action: 'start_processing',
    audit_event_id: auditEvent?.id || null,
    request: detail.withdraw_request,
    payout_execution: detail.payout_execution,
    detail,
  };
}

async function processAdminWithdrawRequestComplete(pool, requestId, body = {}, actor = {}) {
  const normalizedRequestId = Number.parseInt(String(requestId || '').trim(), 10);
  if (!Number.isFinite(normalizedRequestId) || normalizedRequestId <= 0) {
    throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_ID_INVALID', 'Withdraw request id is invalid', 400);
  }

  if (hasForbiddenWithdrawRequestPayoutFields(body, FORBIDDEN_COMPLETE_BODY_FIELDS)) {
    throw buildWithdrawRequestAdminActionError('PAYOUT_PROOF_FIELD_FORBIDDEN', 'Payout proof fields are forbidden', 400);
  }

  const externalRef = normalizeWithdrawRequestAdminActionText(body?.external_ref);
  const bankReference = normalizeWithdrawRequestAdminActionText(body?.bank_reference);
  const receiptUrl = normalizeWithdrawRequestAdminActionText(body?.receipt_url);

  if (!externalRef && !bankReference) {
    throw buildWithdrawRequestAdminActionError('PAYOUT_PROOF_REQUIRED', 'external_ref or bank_reference is required', 400);
  }

  const detail = await getAdminWithdrawRequestDetail(pool, normalizedRequestId);
  if (!detail) {
    throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_NOT_FOUND', 'Withdraw request not found', 404);
  }

  const request = detail.withdraw_request || null;
  const payout = detail.payout_execution || null;
  const requestStatus = normalizeWithdrawRequestAdminActionText(request?.status)?.toLowerCase() || '';
  const payoutStatus = normalizeWithdrawRequestAdminActionText(payout?.status)?.toLowerCase() || '';

  if (!payout) {
    throw buildWithdrawRequestAdminActionError(
      'WITHDRAW_REQUEST_PAYOUT_EXECUTION_REQUIRED',
      'Withdraw request payout execution is required',
      409
    );
  }

  if (!['bank_processing', 'queued_for_payout'].includes(requestStatus)) {
    throw buildWithdrawRequestAdminActionError(
      'WITHDRAW_REQUEST_COMPLETE_NOT_ALLOWED',
      'Withdraw request status is not valid for complete',
      409
    );
  }

  if (!['submitted', 'processing'].includes(payoutStatus)) {
    throw buildWithdrawRequestAdminActionError(
      'PAYOUT_COMPLETE_NOT_ALLOWED',
      'Payout execution status is not valid for complete',
      409
    );
  }

  const adminUserId = Number.isFinite(Number(actor?.user_id)) ? Number(actor.user_id) : null;
  const completedPayout = await completePayoutExecution(
    pool,
    payout.id,
    {
      external_ref: externalRef,
      bank_reference: bankReference,
      receipt_url: receiptUrl,
    },
    {
      user_id: adminUserId,
      user_type: 'admin',
    }
  );

  const freshDetail = await getAdminWithdrawRequestDetail(pool, normalizedRequestId);
  if (!freshDetail) {
    throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_NOT_FOUND', 'Withdraw request not found', 404);
  }

  return {
    action: 'complete',
    request: freshDetail.withdraw_request,
    payout_execution: freshDetail.payout_execution || completedPayout?.payout || null,
    data: freshDetail,
  };
}

async function processAdminWithdrawRequestFail(pool, requestId, body = {}, actor = {}) {
  const normalizedRequestId = Number.parseInt(String(requestId || '').trim(), 10);
  if (!Number.isFinite(normalizedRequestId) || normalizedRequestId <= 0) {
    throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_ID_INVALID', 'Withdraw request id is invalid', 400);
  }

  if (hasForbiddenWithdrawRequestPayoutFields(body, FORBIDDEN_FAIL_BODY_FIELDS)) {
    throw buildWithdrawRequestAdminActionError('PAYOUT_PROOF_FIELD_FORBIDDEN', 'Payout proof fields are forbidden', 400);
  }

  const failureReason = normalizeWithdrawRequestAdminActionText(body?.failure_reason);
  if (!failureReason) {
    throw buildWithdrawRequestAdminActionError('PAYOUT_FAILURE_REASON_REQUIRED', 'Failure reason is required', 400);
  }

  const detail = await getAdminWithdrawRequestDetail(pool, normalizedRequestId);
  if (!detail) {
    throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_NOT_FOUND', 'Withdraw request not found', 404);
  }

  const request = detail.withdraw_request || null;
  const payout = detail.payout_execution || null;
  const requestStatus = normalizeWithdrawRequestAdminActionText(request?.status)?.toLowerCase() || '';
  const payoutStatus = normalizeWithdrawRequestAdminActionText(payout?.status)?.toLowerCase() || '';
  const hasLockEvidence =
    Number(request?.locked_amount || 0) > 0 &&
    Boolean(request?.locked_ledger_group_id) &&
    Boolean(request?.destination_id);

  if (!payout) {
    throw buildWithdrawRequestAdminActionError(
      'WITHDRAW_REQUEST_PAYOUT_EXECUTION_REQUIRED',
      'Withdraw request payout execution is required',
      409
    );
  }

  const requestAllowed =
    ['bank_processing', 'queued_for_payout'].includes(requestStatus) ||
    (requestStatus === 'requires_review' && payoutStatus === 'requires_review' && hasLockEvidence);

  if (!requestAllowed) {
    throw buildWithdrawRequestAdminActionError(
      'WITHDRAW_REQUEST_FAIL_NOT_ALLOWED',
      'Withdraw request status is not valid for fail',
      409
    );
  }

  if (!['submitted', 'processing', 'requires_review'].includes(payoutStatus)) {
    throw buildWithdrawRequestAdminActionError(
      'PAYOUT_FAIL_NOT_ALLOWED',
      'Payout execution status is not valid for fail',
      409
    );
  }

  const adminUserId = Number.isFinite(Number(actor?.user_id)) ? Number(actor.user_id) : null;
  const failedPayout = await failPayoutExecution(
    pool,
    payout.id,
    {
      failure_reason: failureReason,
    },
    {
      user_id: adminUserId,
      user_type: 'admin',
    }
  );

  const freshDetail = await getAdminWithdrawRequestDetail(pool, normalizedRequestId);
  if (!freshDetail) {
    throw buildWithdrawRequestAdminActionError('WITHDRAW_REQUEST_NOT_FOUND', 'Withdraw request not found', 404);
  }

  return {
    action: 'fail',
    request: freshDetail.withdraw_request,
    payout_execution: freshDetail.payout_execution || failedPayout?.payout || null,
    data: freshDetail,
  };
}

function buildMoneyCoreRouter(pool) {
  const r = express.Router();

  function sendWithdrawRequestAdminActionError(res, err) {
    if (!err) {
      return null;
    }

    if (String(err.code || '').startsWith('WITHDRAW_REQUEST_') || err.statusCode) {
      return safeJson(res, err.statusCode || 400, {
        ok: false,
        error: err.code || 'WITHDRAW_REQUEST_ACTION_FAILED',
        message: err.message,
      });
    }

    return null;
  }

  function sendOwnerQrError(res, err, fallbackError = 'OWNER_QR_DESTINATION_INVALID_PAYLOAD', fallbackStatusCode = 400) {
    if (err && (String(err.code || '').startsWith('OWNER_QR_') || String(err.code || '').startsWith('MONEY_CORE_'))) {
      return safeJson(res, err.statusCode || fallbackStatusCode, {
        ok: false,
        error: err.code,
        message: err.message,
      });
    }

    if (err && err.statusCode) {
      return safeJson(res, err.statusCode, {
        ok: false,
        error: err.code || fallbackError,
        message: err.message,
      });
    }

    return null;
  }

  function sendOwnerQrAuthError(res) {
    return safeJson(res, 403, {
      ok: false,
      error: 'OWNER_QR_FORBIDDEN',
    });
  }

  function registerOwnerQrDestinationRoutes(ownerType, basePath) {
    const ownerQrImageUpload = createOwnerQrImageUploadMiddleware();

    r.get(`${basePath}/money-core/owner-qr-destinations`, async (req, res, next) => {
      try {
        const owner = await resolveMoneyCoreOwnerBySlug(pool, ownerType, req.params.slug);

        if (!owner.ok) {
          return safeJson(res, owner.statusCode || 400, {
            ok: false,
            error: owner.error,
          });
        }

        const destinations = await listOwnerQrDestinations(pool, {
          ownerType: owner.owner_type,
          ownerId: owner.owner_id,
        });

        return safeJson(res, 200, {
          ok: true,
          destinations,
        });
      } catch (err) {
        return next(err);
      }
    });

    r.get(`${basePath}/money-core/owner-qr-destinations/active`, async (req, res, next) => {
      try {
        const owner = await resolveMoneyCoreOwnerBySlug(pool, ownerType, req.params.slug);

        if (!owner.ok) {
          return safeJson(res, owner.statusCode || 400, {
            ok: false,
            error: owner.error,
          });
        }

        const destination = await getActiveOwnerQrDestination(pool, {
          ownerType: owner.owner_type,
          ownerId: owner.owner_id,
        });

        return safeJson(res, 200, {
          ok: true,
          destination,
        });
      } catch (err) {
        return next(err);
      }
    });

    r.post(`${basePath}/money-core/owner-qr-destinations`, async (req, res, next) => {
      try {
        if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
          return;
        }

        const owner = await resolveMoneyCoreOwnerBySlug(pool, ownerType, req.params.slug);

        if (!owner.ok) {
          return safeJson(res, owner.statusCode || 400, {
            ok: false,
            error: owner.error,
          });
        }

        const destination = await createOwnerQrDestination({
          pool,
          ownerType: owner.owner_type,
          ownerId: owner.owner_id,
          payload: req.body || {},
          createdByUserId: req.user?.id ?? req.user?.user_id ?? null,
        });

        return safeJson(res, 200, {
          ok: true,
          destination,
        });
      } catch (err) {
        const handled = sendOwnerQrError(res, err);
        if (handled) {
          return handled;
        }
        return next(err);
      }
    });

    r.patch(`${basePath}/money-core/owner-qr-destinations/:id`, async (req, res, next) => {
      try {
        if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
          return;
        }

        const owner = await resolveMoneyCoreOwnerBySlug(pool, ownerType, req.params.slug);

        if (!owner.ok) {
          return safeJson(res, owner.statusCode || 400, {
            ok: false,
            error: owner.error,
          });
        }

        const destination = await updateOwnerQrDestination({
          pool,
          ownerType: owner.owner_type,
          ownerId: owner.owner_id,
          destinationId: req.params.id,
          payload: req.body || {},
        });

        return safeJson(res, 200, {
          ok: true,
          destination,
        });
      } catch (err) {
        const handled = sendOwnerQrError(res, err, 'OWNER_QR_DESTINATION_INVALID_OWNER', 403);
        if (handled) {
          return handled;
        }
        return next(err);
      }
    });

    r.patch(`${basePath}/money-core/owner-qr-destinations/:id/deactivate`, async (req, res, next) => {
      try {
        if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
          return;
        }

        const owner = await resolveMoneyCoreOwnerBySlug(pool, ownerType, req.params.slug);

        if (!owner.ok) {
          return safeJson(res, owner.statusCode || 400, {
            ok: false,
            error: owner.error,
          });
        }

        const destination = await deactivateOwnerQrDestination({
          pool,
          ownerType: owner.owner_type,
          ownerId: owner.owner_id,
          destinationId: req.params.id,
        });

        return safeJson(res, 200, {
          ok: true,
          destination,
        });
      } catch (err) {
        const handled = sendOwnerQrError(res, err, 'OWNER_QR_DESTINATION_INVALID_OWNER', 403);
        if (handled) {
          return handled;
        }
        return next(err);
      }
    });

    r.post(`${basePath}/money-core/owner-qr-destinations/:id/image`, async (req, res, next) => {
      try {
        if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
          return;
        }

        const owner = await resolveMoneyCoreOwnerBySlug(pool, ownerType, req.params.slug);

        if (!owner.ok) {
          return safeJson(res, owner.statusCode || 400, {
            ok: false,
            error: owner.error,
          });
        }

        try {
          await runMiddleware(req, res, ownerQrImageUpload);
        } catch (err) {
          const normalized = normalizeOwnerQrImageUploadError(err);
          if (normalized) {
            return safeJson(res, normalized.statusCode || 400, {
              ok: false,
              error: normalized.code,
              message: normalized.message,
            });
          }

          const handled = sendOwnerQrError(res, err, 'OWNER_QR_IMAGE_INVALID_FILE', 400);
          if (handled) {
            return handled;
          }

          return next(err);
        }

        if (!req.file) {
          return safeJson(res, 400, {
            ok: false,
            error: 'OWNER_QR_IMAGE_INVALID_FILE',
          });
        }

        const destination = await attachOwnerQrDestinationImage({
          pool,
          ownerType: owner.owner_type,
          ownerId: owner.owner_id,
          ownerSlug: owner.owner.slug || req.params.slug,
          destinationId: req.params.id,
          file: req.file,
        });

        return safeJson(res, 200, {
          ok: true,
          destination,
        });
      } catch (err) {
        const normalized = normalizeOwnerQrImageUploadError(err);
        if (normalized) {
          return safeJson(res, normalized.statusCode || 400, {
            ok: false,
            error: normalized.code,
            message: normalized.message,
          });
        }

        const handled = sendOwnerQrError(res, err, 'OWNER_QR_IMAGE_INVALID_FILE', 400);
        if (handled) {
          return handled;
        }

        return next(err);
      }
    });

    r.delete(`${basePath}/money-core/owner-qr-destinations/:id/image`, async (req, res, next) => {
      try {
        if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
          return;
        }

        const owner = await resolveMoneyCoreOwnerBySlug(pool, ownerType, req.params.slug);

        if (!owner.ok) {
          return safeJson(res, owner.statusCode || 400, {
            ok: false,
            error: owner.error,
          });
        }

        const deletionResult = await deleteOwnerQrDestinationImage({
          pool,
          ownerType: owner.owner_type,
          ownerId: owner.owner_id,
          ownerSlug: owner.owner.slug || req.params.slug,
          destinationId: req.params.id,
        });

        return safeJson(res, 200, {
          ok: true,
          no_image: !!(deletionResult && deletionResult.no_image),
          destination: deletionResult && deletionResult.destination ? deletionResult.destination : deletionResult,
        });
      } catch (err) {
        const handled = sendOwnerQrError(res, err, 'OWNER_QR_IMAGE_INVALID_FILE', 400);
        if (handled) {
          return handled;
        }

        return next(err);
      }
    });
  }

  r.get('/money-core/health', async (req, res, next) => {
    try {
      const flags = getMoneyCoreFlags();
      const dbCheck = await pool.query('SELECT 1 AS ok');

      return safeJson(res, 200, {
        ok: true,
        service: 'money-core',
        mode: 'read-only',
        flags,
        db: {
          ok: dbCheck.rows.length === 1 && dbCheck.rows[0].ok === 1,
        },
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/flags', async (req, res, next) => {
    try {
      return safeJson(res, 200, {
        ok: true,
        service: 'money-core',
        flags: getMoneyCoreFlags(),
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/diagnostics', async (req, res, next) => {
    try {
      const flags = getMoneyCoreFlags();

      const tableMeta = await pool.query(
        `
        SELECT
          c.relname AS table_name,
          COALESCE(s.n_live_tup, 0)::bigint AS estimated_rows,
          c.relkind AS relkind
        FROM pg_class c
        JOIN pg_namespace n
          ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s
          ON s.relid = c.oid
        WHERE n.nspname = 'public'
          AND c.relname = ANY ($1::text[])
        ORDER BY c.relname
        `,
        [MONEY_CORE_TABLES]
      );

      const missingTables = MONEY_CORE_TABLES.filter((tableName) => {
        return !tableMeta.rows.some((row) => row.table_name === tableName);
      });

      return safeJson(res, 200, {
        ok: true,
        service: 'money-core',
        mode: 'read-only',
        flags,
        tables: tableMeta.rows,
        missingTables,
        totalKnownTables: MONEY_CORE_TABLES.length,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/legacy-map', async (req, res, next) => {
    try {
      const flags = getMoneyCoreFlags();

      return safeJson(res, 200, {
        ok: true,
        service: 'money-core',
        flags,
        legacyMap: LEGACY_MAP,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/provider-events', async (req, res, next) => {
    try {
      const events = await listProviderEvents(pool, {
        provider_code: req.query?.provider_code,
        payment_id: req.query?.payment_id,
        booking_id: req.query?.booking_id,
        processing_status: req.query?.processing_status,
        status_normalized: req.query?.status_normalized,
        event_type: req.query?.event_type,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });

      return safeJson(res, 200, {
        ok: true,
        events,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/provider-events/:id', async (req, res, next) => {
    try {
      const event = await getProviderEventById(pool, req.params.id);

      if (!event) {
        return safeJson(res, 404, {
          ok: false,
          error: 'PROVIDER_EVENT_NOT_FOUND',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        event,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/money-core/provider-events/import', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertProviderEventsEnabled();
      const event = await createProviderEvent(pool, req.body || {});

      if (!event) {
        return safeJson(res, 409, {
          ok: false,
          error: 'PROVIDER_EVENT_CONFLICT_UNRESOLVED',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        event,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/money-core/provider-events/:id/reprocess', async (req, res, next) => {
    try {
      const event = await getProviderEventById(pool, req.params.id);

      if (!event) {
        return safeJson(res, 404, {
          ok: false,
          error: 'PROVIDER_EVENT_NOT_FOUND',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        reprocessed: false,
        reason: 'MONEY_CORE_READ_ONLY',
        event,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/settlements', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedAccess(res, req)) {
        return;
      }

      const settlements = await listProviderSettlements(pool, {
        provider_code: req.query?.provider_code,
        status: req.query?.status,
        settlement_source: req.query?.settlement_source,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });

      return safeJson(res, 200, {
        ok: true,
        settlements,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/settlements/:id', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      const settlement = await getProviderSettlementById(pool, req.params.id);

      if (!settlement) {
        return safeJson(res, 404, {
          ok: false,
          error: 'SETTLEMENT_NOT_FOUND',
        });
      }

      if (!hasMoneyCorePrivilegedAccess(req) && !hasMoneyCoreOwnerAccess(req, settlement.owner_type, settlement.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'MONEY_CORE_OWNER_ACCESS_REQUIRED',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        settlement,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/money-core/settlements/manual', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertProviderSettlementsEnabled();
      const settlement = await createManualSettlement(pool, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
      });

      return safeJson(res, 200, {
        ok: true,
        settlement,
      });
    } catch (err) {
      if (err && String(err.code || "").startsWith("MONEY_CORE_")) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.post('/money-core/settlements/:id/confirm-bank-received', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertProviderSettlementsEnabled();
      const settlement = await confirmBankReceived(
        pool,
        req.params.id,
        req.body || {},
        {
          user_id: req.user?.id ?? req.user?.user_id ?? null,
          user_type: req.user?.type ?? null,
        }
      );

      if (!settlement) {
        return safeJson(res, 404, {
          ok: false,
          error: 'SETTLEMENT_NOT_FOUND',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        settlement,
      });
    } catch (err) {
      if (err && String(err.code || "").startsWith("MONEY_CORE_")) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.post('/money-core/settlements/:id/fail', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertProviderSettlementsEnabled();
      const settlement = await failProviderSettlement(
        pool,
        req.params.id,
        req.body || {},
        {
          user_id: req.user?.id ?? req.user?.user_id ?? null,
        }
      );

      if (!settlement) {
        return safeJson(res, 404, {
          ok: false,
          error: 'SETTLEMENT_NOT_FOUND',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        settlement,
      });
    } catch (err) {
      if (err && String(err.code || "").startsWith("MONEY_CORE_")) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.get('/money-core/split-allocations', async (req, res, next) => {
    try {
      const ownerType = String(req.query?.owner_type || '').trim().toLowerCase();
      const ownerId = req.query?.owner_id;

      if (!requireMoneyCoreOwnerAccess(res, req, ownerType, ownerId)) {
        return;
      }

      const allocations = await listSplitAllocations(pool, {
        provider_settlement_id: req.query?.provider_settlement_id,
        payment_id: req.query?.payment_id,
        booking_id: req.query?.booking_id,
        owner_type: req.query?.owner_type,
        owner_id: req.query?.owner_id,
        status: req.query?.status,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });

      return safeJson(res, 200, {
        ok: true,
        allocations,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/split-allocations/:id', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      const allocation = await getSplitAllocationById(pool, req.params.id);

      if (!allocation) {
        return safeJson(res, 404, {
          ok: false,
          error: 'SPLIT_ALLOCATION_NOT_FOUND',
        });
      }

      if (!hasMoneyCorePrivilegedAccess(req) && !hasMoneyCoreOwnerAccess(req, allocation.owner_type, allocation.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'MONEY_CORE_OWNER_ACCESS_REQUIRED',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        allocation,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/money-core/settlements/:id/split/preview', async (req, res, next) => {
    try {
      const preview = await previewSettlementSplit(pool, req.params.id, req.body || {});

      if (!preview) {
        return safeJson(res, 404, {
          ok: false,
          error: 'SETTLEMENT_NOT_FOUND',
        });
      }

      return safeJson(res, 200, preview);
    } catch (err) {
      return next(err);
    }
  });

  r.post('/money-core/settlements/:id/split/apply', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertProviderSettlementsEnabled();
      const settlement = await createSettlementSplitAllocations(pool, req.params.id, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
        user_type: req.user?.type ?? null,
      });

      if (!settlement) {
        return safeJson(res, 404, {
          ok: false,
          error: 'SETTLEMENT_NOT_FOUND',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        settlement,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }

      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'SPLIT_ALLOCATION_APPLY_FAILED',
          message: err.message,
        });
      }

      return next(err);
    }
  });

  r.get('/money-core/ledger', async (req, res, next) => {
    try {
      const ownerType = String(req.query?.owner_type || '').trim().toLowerCase();
      const ownerId = req.query?.owner_id;

      if (!requireMoneyCoreOwnerAccess(res, req, ownerType, ownerId)) {
        return;
      }

      const entries = await listMoneyLedgerEntries(pool, {
        owner_type: req.query?.owner_type,
        owner_id: req.query?.owner_id,
        money_zone: req.query?.money_zone,
        direction: req.query?.direction,
        source_type: req.query?.source_type,
        source_id: req.query?.source_id,
        entry_group_id: req.query?.entry_group_id,
        currency: req.query?.currency,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });

      return safeJson(res, 200, {
        ok: true,
        entries,
      });
    } catch (err) {
      if (err && String(err.code || "").startsWith("MONEY_CORE_")) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.get('/money-core/ledger/:id', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      const entry = await getMoneyLedgerEntryById(pool, req.params.id);

      if (!entry) {
        return safeJson(res, 404, {
          ok: false,
          error: 'MONEY_LEDGER_ENTRY_NOT_FOUND',
        });
      }

      if (!hasMoneyCorePrivilegedAccess(req) && !hasMoneyCoreOwnerAccess(req, entry.owner_type, entry.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'MONEY_CORE_OWNER_ACCESS_REQUIRED',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        entry,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/owners/:ownerType/:ownerId/ledger', async (req, res, next) => {
    try {
      if (!requireMoneyCoreOwnerAccess(res, req, req.params.ownerType, req.params.ownerId)) {
        return;
      }

      const entries = await getOwnerMoneyLedger(pool, req.params.ownerType, req.params.ownerId, {
        money_zone: req.query?.money_zone,
        direction: req.query?.direction,
        source_type: req.query?.source_type,
        source_id: req.query?.source_id,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });

      return safeJson(res, 200, {
        ok: true,
        entries,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/owners/:ownerType/:ownerId/owner-obligations', async (req, res, next) => {
    try {
      const owner = await resolveMoneyCoreOwnerById(pool, req.params.ownerType, req.params.ownerId);

      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      if (!hasMoneyCoreOwnerAccess(req, owner.owner_type, owner.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'OWNER_QR_FORBIDDEN',
        });
      }

      const data = await listOwnerObligations(pool, {
        ownerType: owner.owner_type,
        ownerId: owner.owner_id,
      });

      return safeJson(res, 200, {
        ok: true,
        owner_type: data.owner_type,
        owner_id: data.owner_id,
        outgoing_open_total: data.outgoing_open_total,
        incoming_open_total: data.incoming_open_total,
        rows: data.rows,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/money-core/owners/:ownerType/:ownerId/balance/rebuild', async (req, res, next) => {
    try {
      const balance = await rebuildOwnerBalanceFromLedger(
        pool,
        req.params.ownerType,
        req.params.ownerId,
        req.body?.currency || 'KGS',
        {
          user_id: req.user?.id ?? req.user?.user_id ?? null,
        }
      );

      return safeJson(res, 200, {
        ok: true,
        balance,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }

      return next(err);
    }
  });

  r.post('/money-core/ledger/movements', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertLedgerMovementsEnabled();
      const result = await createMoneyLedgerMovement(pool, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
        user_type: req.user?.type ?? null,
      });

      return safeJson(res, 200, {
        ok: true,
        ...result,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }

      return next(err);
    }
  });

  r.get('/money-core/destination-providers', async (req, res, next) => {
    try {
      const providers = await listDestinationProviders(pool, {
        method: req.query?.method,
        enabled: req.query?.enabled,
        country: req.query?.country,
      });

      return safeJson(res, 200, {
        ok: true,
        providers,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/owners/:ownerType/:ownerId/withdraw-destinations', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      if (!hasMoneyCorePrivilegedAccess(req)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'WITHDRAW_DESTINATION_FORBIDDEN',
        });
      }

      const destinations = await listWithdrawDestinations(pool, req.params.ownerType, req.params.ownerId, {
        method: req.query?.method,
        status: req.query?.status,
      });

      return safeJson(res, 200, {
        ok: true,
        destinations,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/money-core/owners/:ownerType/:ownerId/withdraw-destinations', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      if (!hasMoneyCorePrivilegedAccess(req)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'WITHDRAW_DESTINATION_FORBIDDEN',
        });
      }

      assertWithdrawDestinationsWriteEnabled();
      const destination = await createWithdrawDestination(pool, req.params.ownerType, req.params.ownerId, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
      });

      return safeJson(res, 200, {
        ok: true,
        destination,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'WITHDRAW_DESTINATION_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.get('/money-core/withdraw-destinations/:id', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      const destination = await getWithdrawDestinationById(pool, req.params.id);
      if (!destination) {
        return safeJson(res, 404, {
          ok: false,
          error: 'WITHDRAW_DESTINATION_NOT_FOUND',
        });
      }

      if (!hasMoneyCorePrivilegedAccess(req) && !hasMoneyCoreOwnerAccess(req, destination.owner_type, destination.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'WITHDRAW_DESTINATION_FORBIDDEN',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        destination,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.patch('/money-core/withdraw-destinations/:id', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      const current = await getWithdrawDestinationById(pool, req.params.id);
      if (!current) {
        return safeJson(res, 404, {
          ok: false,
          error: 'WITHDRAW_DESTINATION_NOT_FOUND',
        });
      }

      if (!hasMoneyCorePrivilegedAccess(req) && !hasMoneyCoreOwnerAccess(req, current.owner_type, current.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'WITHDRAW_DESTINATION_FORBIDDEN',
        });
      }

      assertWithdrawDestinationsWriteEnabled();
      const destination = await updateWithdrawDestination(pool, req.params.id, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
      });

      if (!destination) {
        return safeJson(res, 404, {
          ok: false,
          error: 'WITHDRAW_DESTINATION_NOT_FOUND',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        destination,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'WITHDRAW_DESTINATION_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.post('/money-core/withdraw-destinations/:id/archive', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      const current = await getWithdrawDestinationById(pool, req.params.id);
      if (!current) {
        return safeJson(res, 404, {
          ok: false,
          error: 'WITHDRAW_DESTINATION_NOT_FOUND',
        });
      }

      if (!hasMoneyCorePrivilegedAccess(req) && !hasMoneyCoreOwnerAccess(req, current.owner_type, current.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'WITHDRAW_DESTINATION_FORBIDDEN',
        });
      }

      assertWithdrawDestinationsWriteEnabled();
      const destination = await archiveWithdrawDestination(pool, req.params.id, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
      });

      if (!destination) {
        return safeJson(res, 404, {
          ok: false,
          error: 'WITHDRAW_DESTINATION_NOT_FOUND',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        destination,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.get('/money-core/owners/:ownerType/:ownerId/withdraw-settings', async (req, res, next) => {
    try {
      const settings = await getWithdrawSettings(pool, req.params.ownerType, req.params.ownerId);

      return safeJson(res, 200, {
        ok: true,
        settings,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.patch('/money-core/owners/:ownerType/:ownerId/withdraw-settings', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertWithdrawRequestsEnabled();
      const settings = await upsertWithdrawSettings(pool, req.params.ownerType, req.params.ownerId, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
      });

      return safeJson(res, 200, {
        ok: true,
        settings,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'WITHDRAW_SETTINGS_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.get('/money-core/owners/:ownerType/:ownerId/withdraw-requests', async (req, res, next) => {
    try {
      if (!requireMoneyCoreOwnerAccess(res, req, req.params.ownerType, req.params.ownerId)) {
        return;
      }

      const requests = await listWithdrawRequests(pool, req.params.ownerType, req.params.ownerId, {
        status: req.query?.status,
        destination_id: req.query?.destination_id,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });

      return safeJson(res, 200, {
        ok: true,
        requests,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/money-core/owners/:ownerType/:ownerId/withdraw-requests', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertWithdrawRequestsEnabled();
      const result = await createWithdrawRequest(pool, req.params.ownerType, req.params.ownerId, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
        user_type: req.user?.type ?? null,
      });

      return safeJson(res, 200, {
        ok: true,
        request: result.request,
        ledger: result.ledger,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'WITHDRAW_REQUEST_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.get('/money-core/withdraw-requests/:id', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      const request = await getWithdrawRequestById(pool, req.params.id);

      if (!request) {
        return safeJson(res, 404, {
          ok: false,
          error: 'WITHDRAW_REQUEST_NOT_FOUND',
        });
      }

      if (!hasMoneyCorePrivilegedAccess(req) && !hasMoneyCoreOwnerAccess(req, request.owner_type, request.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'MONEY_CORE_OWNER_ACCESS_REQUIRED',
        });
      }

      const [ownerSafeRequest] = await attachOwnerSafeWithdrawRequestSummaries(pool, [request]);

      return safeJson(res, 200, {
        ok: true,
        request,
        payout_result: ownerSafeRequest?.payout_result || null,
        destination_summary: ownerSafeRequest?.destination_summary || null,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/payout-executions', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedAccess(res, req)) {
        return;
      }

      const payouts = await listPayoutExecutions(pool, {
        owner_type: req.query?.owner_type,
        owner_id: req.query?.owner_id,
        status: req.query?.status,
        withdraw_request_id: req.query?.withdraw_request_id,
        payout_mode: req.query?.payout_mode,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });

      return safeJson(res, 200, {
        ok: true,
        payouts,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/payout-executions/:id', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      const payout = await getPayoutExecutionById(pool, req.params.id);

      if (!payout) {
        return safeJson(res, 404, {
          ok: false,
          error: 'PAYOUT_EXECUTION_NOT_FOUND',
        });
      }

      if (!hasMoneyCorePrivilegedAccess(req) && !hasMoneyCoreOwnerAccess(req, payout.owner_type, payout.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'MONEY_CORE_OWNER_ACCESS_REQUIRED',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        payout,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/money-core/payout-executions', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertPayoutExecutionsEnabled();
      const payout = await createPayoutExecution(pool, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
        user_type: req.user?.type ?? null,
      });

      return safeJson(res, 200, {
        ok: true,
        payout,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'PAYOUT_EXECUTION_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.post('/money-core/payout-executions/:id/submit-manual', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertPayoutExecutionsEnabled();
      const payout = await submitManualPayoutExecution(pool, req.params.id, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
        user_type: req.user?.type ?? null,
      });

      if (!payout) {
        return safeJson(res, 404, {
          ok: false,
          error: 'PAYOUT_EXECUTION_NOT_FOUND',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        payout,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'PAYOUT_EXECUTION_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.post('/money-core/payout-executions/:id/complete', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertPayoutExecutionsEnabled();
      const result = await completePayoutExecution(pool, req.params.id, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
        user_type: req.user?.type ?? null,
      });

      if (!result) {
        return safeJson(res, 404, {
          ok: false,
          error: 'PAYOUT_EXECUTION_NOT_FOUND',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        ...result,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'PAYOUT_EXECUTION_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.post('/money-core/payout-executions/:id/fail', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertPayoutExecutionsEnabled();
      const result = await failPayoutExecution(pool, req.params.id, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
        user_type: req.user?.type ?? null,
      });

      if (!result) {
        return safeJson(res, 404, {
          ok: false,
          error: 'PAYOUT_EXECUTION_NOT_FOUND',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        ...result,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'PAYOUT_EXECUTION_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.get('/money-core/reconciliation', async (req, res, next) => {
    try {
      const runs = await listReconciliationRuns(pool, {
        run_type: req.query?.run_type,
        status: req.query?.status,
        provider_code: req.query?.provider_code,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });

      return safeJson(res, 200, {
        ok: true,
        runs,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/reconciliation/:id', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedAccess(res, req)) {
        return;
      }

      const run = await getReconciliationRunById(pool, req.params.id);

      if (!run) {
        return safeJson(res, 404, {
          ok: false,
          error: 'RECONCILIATION_RUN_NOT_FOUND',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        ...run,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/reconciliation-mismatches', async (req, res, next) => {
    try {
      const mismatches = await listReconciliationMismatches(pool, {
        run_id: req.query?.run_id,
        severity: req.query?.severity,
        status: req.query?.status,
        source_type: req.query?.source_type,
        source_id: req.query?.source_id,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });

      return safeJson(res, 200, {
        ok: true,
        mismatches,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/money-core/reconciliation/run', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertReconciliationEnabled();
      const result = await runReconciliation(pool, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
        user_type: req.user?.type ?? null,
      });

      return safeJson(res, 200, {
        ok: true,
        ...result,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'RECONCILIATION_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.post('/money-core/reconciliation-mismatches/:id/resolve', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertReconciliationEnabled();
      const mismatch = await resolveReconciliationMismatch(pool, req.params.id, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
        user_type: req.user?.type ?? null,
      });

      if (!mismatch) {
        return safeJson(res, 404, {
          ok: false,
          error: 'RECONCILIATION_MISMATCH_NOT_FOUND',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        mismatch,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'RECONCILIATION_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.get('/money-core/admin/overview', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const data = await buildAdminMoneyCoreOverview(pool);
      return safeJson(res, 200, {
        ok: true,
        data,
        meta: {},
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/admin/owner-balances', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const data = await listAdminOwnerBalances(pool, {
        owner_type: req.query?.owner_type,
        owner_id: req.query?.owner_id,
        status: req.query?.status,
        provider_code: req.query?.provider_code,
        severity: req.query?.severity,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });
      return safeJson(res, 200, { ok: true, data, meta: {} });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/admin/withdraw-requests', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const data = await listAdminWithdrawRequests(pool, {
        owner_type: req.query?.owner_type,
        owner_id: req.query?.owner_id,
        status: req.query?.status,
        provider_code: req.query?.provider_code,
        severity: req.query?.severity,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });
      const decorated = Array.isArray(data)
        ? data.map((row) => decorateWithdrawRequestRow(row))
        : [];
      return safeJson(res, 200, { ok: true, data: decorated, meta: {} });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/admin/withdraw-requests-summary', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const data = await buildAdminWithdrawRequestsSummary(pool);
      return safeJson(res, 200, {
        ok: true,
        summary: data.summary,
        by_status: data.by_status,
        generated_at: data.generated_at,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/admin/withdraw-requests/:id', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const data = await getAdminWithdrawRequestDetail(pool, req.params.id);
      if (!data) {
        return safeJson(res, 404, {
          ok: false,
          error: 'WITHDRAW_REQUEST_NOT_FOUND',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        data,
        meta: {},
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/money-core/admin/withdraw-requests/:id/claim', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const result = await processAdminWithdrawRequestAction(pool, req.params.id, 'claim', req.body || {}, req.admin || {});
      return safeJson(res, 200, {
        ok: true,
        request: result.request,
        audit_event_id: result.audit_event_id,
        action: result.action,
      });
    } catch (err) {
      const handled = sendWithdrawRequestAdminActionError(res, err);
      if (handled) {
        return handled;
      }
      return next(err);
    }
  });

  r.post('/money-core/admin/withdraw-requests/:id/reject', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const result = await processAdminWithdrawRequestAction(pool, req.params.id, 'reject', req.body || {}, req.admin || {});
      return safeJson(res, 200, {
        ok: true,
        request: result.request,
        audit_event_id: result.audit_event_id,
        action: result.action,
      });
    } catch (err) {
      const handled = sendWithdrawRequestAdminActionError(res, err);
      if (handled) {
        return handled;
      }
      return next(err);
    }
  });

  r.post('/money-core/admin/withdraw-requests/:id/comment', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const result = await processAdminWithdrawRequestAction(pool, req.params.id, 'comment', req.body || {}, req.admin || {});
      return safeJson(res, 200, {
        ok: true,
        request: result.request,
        audit_event_id: result.audit_event_id,
        action: result.action,
      });
    } catch (err) {
      const handled = sendWithdrawRequestAdminActionError(res, err);
      if (handled) {
        return handled;
      }
      return next(err);
    }
  });

  r.post('/money-core/admin/withdraw-requests/:id/start-processing', AdminRuntimeGuard, async (req, res, next) => {
    try {
      assertPayoutExecutionsEnabled();
      const result = await processAdminWithdrawRequestStartProcessing(pool, req.params.id, req.body || {}, req.admin || {});
      return safeJson(res, 200, {
        ok: true,
        action: result.action,
        audit_event_id: result.audit_event_id,
        request: result.request,
        payout_execution: result.payout_execution,
        data: result.detail,
      });
    } catch (err) {
      const handled = sendWithdrawRequestStartProcessingError(res, err);
      if (handled) {
        return handled;
      }
      return next(err);
    }
  });

  r.post('/money-core/admin/withdraw-requests/:id/complete', AdminRuntimeGuard, async (req, res, next) => {
    try {
      assertPayoutExecutionsEnabled();
      const result = await processAdminWithdrawRequestComplete(pool, req.params.id, req.body || {}, req.admin || {});
      return safeJson(res, 200, {
        ok: true,
        action: result.action,
        request: result.request,
        payout_execution: result.payout_execution,
        data: result.data,
      });
    } catch (err) {
      const handled = sendWithdrawRequestPayoutActionError(res, err);
      if (handled) {
        return handled;
      }
      return next(err);
    }
  });

  r.post('/money-core/admin/withdraw-requests/:id/fail', AdminRuntimeGuard, async (req, res, next) => {
    try {
      assertPayoutExecutionsEnabled();
      const result = await processAdminWithdrawRequestFail(pool, req.params.id, req.body || {}, req.admin || {});
      return safeJson(res, 200, {
        ok: true,
        action: result.action,
        request: result.request,
        payout_execution: result.payout_execution,
        data: result.data,
      });
    } catch (err) {
      const handled = sendWithdrawRequestPayoutActionError(res, err);
      if (handled) {
        return handled;
      }
      return next(err);
    }
  });

  r.get('/money-core/admin/payout-executions', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const data = await listAdminPayoutExecutions(pool, {
        owner_type: req.query?.owner_type,
        owner_id: req.query?.owner_id,
        status: req.query?.status,
        provider_code: req.query?.provider_code,
        severity: req.query?.severity,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });
      return safeJson(res, 200, { ok: true, data, meta: {} });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/admin/reconciliation', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const data = await listAdminReconciliationRuns(pool, {
        owner_type: req.query?.owner_type,
        owner_id: req.query?.owner_id,
        status: req.query?.status,
        provider_code: req.query?.provider_code,
        severity: req.query?.severity,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });
      return safeJson(res, 200, { ok: true, data, meta: {} });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/admin/exceptions', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const data = await listAdminMoneyCoreExceptions(pool, {
        owner_type: req.query?.owner_type,
        owner_id: req.query?.owner_id,
        status: req.query?.status,
        provider_code: req.query?.provider_code,
        severity: req.query?.severity,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });
      return safeJson(res, 200, { ok: true, data, meta: {} });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/admin/provider-events', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const data = await listAdminProviderEvents(pool, {
        provider_code: req.query?.provider_code,
        processing_status: req.query?.processing_status,
        status_normalized: req.query?.status_normalized,
        event_type: req.query?.event_type,
        payment_id: req.query?.payment_id,
        booking_id: req.query?.booking_id,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });
      return safeJson(res, 200, { ok: true, data, meta: {} });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/admin/settlements', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const data = await listAdminProviderSettlements(pool, {
        provider_code: req.query?.provider_code,
        status: req.query?.status,
        settlement_source: req.query?.settlement_source,
        provider_settlement_id: req.query?.provider_settlement_id,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });
      return safeJson(res, 200, { ok: true, data, meta: {} });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/admin/receipts', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const data = await listAdminMoneyReceipts(pool, {
        receipt_type: req.query?.receipt_type,
        source_type: req.query?.source_type,
        source_id: req.query?.source_id,
        owner_type: req.query?.owner_type,
        owner_id: req.query?.owner_id,
        external_ref: req.query?.external_ref,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });
      return safeJson(res, 200, { ok: true, data, meta: {} });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/admin/audit-events', AdminRuntimeGuard, async (req, res, next) => {
    try {
      const data = await listAdminMoneyAuditEvents(pool, {
        event_type: req.query?.event_type,
        actor_type: req.query?.actor_type,
        actor_id: req.query?.actor_id,
        owner_type: req.query?.owner_type,
        owner_id: req.query?.owner_id,
        source_type: req.query?.source_type,
        source_id: req.query?.source_id,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });
      return safeJson(res, 200, { ok: true, data, meta: {} });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/salons/:slug/money-core/withdraw-destinations', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      const owner = await resolveMoneyCoreOwnerBySlug(pool, 'salon', req.params.slug);

      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      if (!hasMoneyCorePrivilegedAccess(req) && !hasMoneyCoreOwnerAccess(req, owner.owner_type, owner.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'WITHDRAW_DESTINATION_FORBIDDEN',
        });
      }

      const destinations = await listWithdrawDestinations(pool, owner.owner_type, owner.owner_id, {
        method: req.query?.method,
        status: req.query?.status,
      });

      return safeJson(res, 200, {
        ok: true,
        destinations,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/salons/:slug/money-core/withdraw-destinations', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      assertWithdrawDestinationsWriteEnabled();
      const owner = await resolveMoneyCoreOwnerBySlug(pool, 'salon', req.params.slug);

      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      if (!hasMoneyCorePrivilegedAccess(req) && !hasMoneyCoreOwnerAccess(req, owner.owner_type, owner.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'WITHDRAW_DESTINATION_FORBIDDEN',
        });
      }

      const destination = await createWithdrawDestination(pool, owner.owner_type, owner.owner_id, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
      });

      return safeJson(res, 200, {
        ok: true,
        destination,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'WITHDRAW_DESTINATION_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.patch('/money-core/payments/:paymentId/collector', async (req, res, next) => {
    const db = await pool.connect();

    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertMoneyCoreWriteAllowed();

      const paymentId = Number.parseInt(String(req.params.paymentId || '').trim(), 10);
      if (!Number.isInteger(paymentId) || paymentId <= 0) {
        return safeJson(res, 400, {
          ok: false,
          error: 'PAYMENT_ID_INVALID',
        });
      }

      const body = req.body || {};
      const collectorOwnerType = String(body.collector_owner_type || body.collectorOwnerType || '').trim().toLowerCase();
      const collectorOwnerId = Number.parseInt(String(body.collector_owner_id || body.collectorOwnerId || '').trim(), 10);
      const reason = String(body.reason || '').trim();
      const actorUserId = Number(req.auth?.user_id ?? req.user?.id ?? req.user?.user_id ?? null);

      if (!['salon', 'master'].includes(collectorOwnerType)) {
        return safeJson(res, 400, {
          ok: false,
          error: 'INVALID_COLLECTOR_OWNER_TYPE',
        });
      }

      if (!Number.isInteger(collectorOwnerId) || collectorOwnerId <= 0) {
        return safeJson(res, 400, {
          ok: false,
          error: 'INVALID_COLLECTOR_OWNER_ID',
        });
      }

      if (reason.length < 10) {
        return safeJson(res, 400, {
          ok: false,
          error: 'COLLECTOR_REPAIR_REASON_REQUIRED',
        });
      }

      await db.query('BEGIN');

      const paymentRes = await db.query(
        `
SELECT
  id,
  booking_id,
  provider,
  status,
  amount,
  collector_owner_type,
  collector_owner_id
FROM public.payments
WHERE id = $1
FOR UPDATE
LIMIT 1
`,
        [paymentId]
      );

      const payment = paymentRes.rows[0] || null;

      if (!payment) {
        await db.query('ROLLBACK');
        return safeJson(res, 404, {
          ok: false,
          error: 'COLLECTOR_REPAIR_PAYMENT_NOT_FOUND',
        });
      }

      if (String(payment.provider || '').trim().toLowerCase() !== 'direct') {
        await db.query('ROLLBACK');
        return safeJson(res, 409, {
          ok: false,
          error: 'COLLECTOR_REPAIR_PAYMENT_NOT_DIRECT',
        });
      }

      if (String(payment.status || '').trim().toLowerCase() !== 'confirmed') {
        await db.query('ROLLBACK');
        return safeJson(res, 409, {
          ok: false,
          error: 'COLLECTOR_REPAIR_PAYMENT_NOT_CONFIRMED',
        });
      }

      if (payment.collector_owner_type != null || payment.collector_owner_id != null) {
        await db.query('ROLLBACK');
        return safeJson(res, 409, {
          ok: false,
          error: 'COLLECTOR_REPAIR_COLLECTOR_ALREADY_SET',
        });
      }

      const bookingRes = await db.query(
        `
SELECT
  id,
  salon_id,
  master_id,
  status
FROM public.bookings
WHERE id = $1
FOR UPDATE
LIMIT 1
`,
        [payment.booking_id]
      );

      const booking = bookingRes.rows[0] || null;

      if (!booking) {
        await db.query('ROLLBACK');
        return safeJson(res, 404, {
          ok: false,
          error: 'COLLECTOR_REPAIR_BOOKING_NOT_FOUND',
        });
      }

      const bookingStatus = String(booking.status || '').trim().toLowerCase();
      if (bookingStatus === 'cancelled' || bookingStatus === 'canceled') {
        await db.query('ROLLBACK');
        return safeJson(res, 409, {
          ok: false,
          error: 'COLLECTOR_REPAIR_BOOKING_CANCELLED',
        });
      }

      const expectedOwnerId = collectorOwnerType === 'salon' ? Number(booking.salon_id || 0) : Number(booking.master_id || 0);
      if (!Number.isInteger(expectedOwnerId) || expectedOwnerId <= 0 || expectedOwnerId !== collectorOwnerId) {
        await db.query('ROLLBACK');
        return safeJson(res, 409, {
          ok: false,
          error: 'COLLECTOR_REPAIR_OWNER_MISMATCH',
        });
      }

      const updateRes = await db.query(
        `
UPDATE public.payments
SET
  collector_owner_type = $1,
  collector_owner_id = $2,
  updated_at = now()
WHERE id = $3
RETURNING
  id,
  booking_id,
  provider,
  status,
  amount,
  collector_owner_type,
  collector_owner_id,
  updated_at
`,
        [collectorOwnerType, collectorOwnerId, paymentId]
      );

      const updatedPayment = updateRes.rows[0] || null;
      if (!updatedPayment) {
        await db.query('ROLLBACK');
        return safeJson(res, 404, {
          ok: false,
          error: 'COLLECTOR_REPAIR_PAYMENT_NOT_FOUND',
        });
      }

      const auditEvent = await insertMoneyAuditEvent(db, {
        event_type: 'money_core_direct_payment_collector_repair',
        actor_type: req.auth?.role || 'system',
        actor_id: actorUserId,
        owner_type: collectorOwnerType,
        owner_id: collectorOwnerId,
        source_type: 'payment',
        source_id: paymentId,
        amount: Number(payment.amount || 0),
        data: {
          reason,
          payment_id: paymentId,
          booking_id: Number(payment.booking_id || 0) || null,
          salon_id: Number(booking.salon_id || 0) || null,
          master_id: Number(booking.master_id || 0) || null,
          route: "/internal/money-core/payments/:paymentId/collector",
          before: {
            collector_owner_type: payment.collector_owner_type ?? null,
            collector_owner_id: payment.collector_owner_id ?? null,
          },
          after: {
            collector_owner_type: collectorOwnerType,
            collector_owner_id: collectorOwnerId,
          },
        },
      });

      if (!auditEvent) {
        throw new Error('COLLECTOR_REPAIR_AUDIT_FAILED');
      }

      await db.query('COMMIT');

      return safeJson(res, 200, {
        ok: true,
        payment: updatedPayment,
        audit_event_id: auditEvent.id || null,
      });
    } catch (err) {
      try {
        await db.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('COLLECTOR_REPAIR_ROLLBACK_ERROR', rollbackErr);
      }

      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }

      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'COLLECTOR_REPAIR_FAILED',
          message: err.message,
        });
      }

      if (String(err?.message || '') === 'COLLECTOR_REPAIR_AUDIT_FAILED') {
        return safeJson(res, 500, {
          ok: false,
          error: 'COLLECTOR_REPAIR_FAILED',
        });
      }

      return safeJson(res, 500, {
        ok: false,
        error: 'COLLECTOR_REPAIR_FAILED',
      });
    } finally {
      db.release();
    }
  });

  registerOwnerQrDestinationRoutes('salon', '/salons/:slug');

  r.get('/salons/:slug/money-core/withdraw-settings', async (req, res, next) => {
    try {
      const owner = await resolveMoneyCoreOwnerBySlug(pool, 'salon', req.params.slug);

      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      const settings = await getWithdrawSettings(pool, owner.owner_type, owner.owner_id);

      return safeJson(res, 200, {
        ok: true,
        settings,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.patch('/salons/:slug/money-core/withdraw-settings', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertWithdrawRequestsEnabled();
      const owner = await resolveMoneyCoreOwnerBySlug(pool, 'salon', req.params.slug);

      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      const settings = await upsertWithdrawSettings(pool, owner.owner_type, owner.owner_id, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
      });

      return safeJson(res, 200, {
        ok: true,
        settings,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'WITHDRAW_SETTINGS_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.get('/salons/:slug/money-core/withdraw-requests', async (req, res, next) => {
    try {
      const owner = await resolveMoneyCoreOwnerBySlug(pool, 'salon', req.params.slug);

      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      const requests = await listWithdrawRequests(pool, owner.owner_type, owner.owner_id, {
        status: req.query?.status,
        destination_id: req.query?.destination_id,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });

      return safeJson(res, 200, {
        ok: true,
        requests,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/salons/:slug/money-core/withdraw-requests', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertWithdrawRequestsEnabled();
      const owner = await resolveMoneyCoreOwnerBySlug(pool, 'salon', req.params.slug);

      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      const result = await createWithdrawRequest(pool, owner.owner_type, owner.owner_id, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
        user_type: req.user?.type ?? null,
      });

      return safeJson(res, 200, {
        ok: true,
        request: result.request,
        ledger: result.ledger,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'WITHDRAW_REQUEST_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.get('/masters/:slug/money-core/withdraw-destinations', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      const owner = await resolveMoneyCoreOwnerBySlug(pool, 'master', req.params.slug);

      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      if (!hasMoneyCorePrivilegedAccess(req) && !hasMoneyCoreOwnerAccess(req, owner.owner_type, owner.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'WITHDRAW_DESTINATION_FORBIDDEN',
        });
      }

      const destinations = await listWithdrawDestinations(pool, owner.owner_type, owner.owner_id, {
        method: req.query?.method,
        status: req.query?.status,
      });

      return safeJson(res, 200, {
        ok: true,
        destinations,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/masters/:slug/money-core/withdraw-destinations', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      assertWithdrawDestinationsWriteEnabled();
      const owner = await resolveMoneyCoreOwnerBySlug(pool, 'master', req.params.slug);

      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      if (!hasMoneyCorePrivilegedAccess(req) && !hasMoneyCoreOwnerAccess(req, owner.owner_type, owner.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'WITHDRAW_DESTINATION_FORBIDDEN',
        });
      }

      const destination = await createWithdrawDestination(pool, owner.owner_type, owner.owner_id, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
      });

      return safeJson(res, 200, {
        ok: true,
        destination,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'WITHDRAW_DESTINATION_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  registerOwnerQrDestinationRoutes('master', '/masters/:slug');

  r.get('/masters/:slug/money-core/withdraw-settings', async (req, res, next) => {
    try {
      const owner = await resolveMoneyCoreOwnerBySlug(pool, 'master', req.params.slug);

      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      const settings = await getWithdrawSettings(pool, owner.owner_type, owner.owner_id);

      return safeJson(res, 200, {
        ok: true,
        settings,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.patch('/masters/:slug/money-core/withdraw-settings', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertWithdrawRequestsEnabled();
      const owner = await resolveMoneyCoreOwnerBySlug(pool, 'master', req.params.slug);

      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      const settings = await upsertWithdrawSettings(pool, owner.owner_type, owner.owner_id, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
      });

      return safeJson(res, 200, {
        ok: true,
        settings,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'WITHDRAW_SETTINGS_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.get('/masters/:slug/money-core/withdraw-requests', async (req, res, next) => {
    try {
      const owner = await resolveMoneyCoreOwnerBySlug(pool, 'master', req.params.slug);

      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      const requests = await listWithdrawRequests(pool, owner.owner_type, owner.owner_id, {
        status: req.query?.status,
        destination_id: req.query?.destination_id,
        limit: req.query?.limit,
        offset: req.query?.offset,
      });

      return safeJson(res, 200, {
        ok: true,
        requests,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/masters/:slug/money-core/withdraw-requests', async (req, res, next) => {
    try {
      if (!requireMoneyCorePrivilegedWriteAccess(res, req)) {
        return;
      }

      assertWithdrawRequestsEnabled();
      const owner = await resolveMoneyCoreOwnerBySlug(pool, 'master', req.params.slug);

      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      const result = await createWithdrawRequest(pool, owner.owner_type, owner.owner_id, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
        user_type: req.user?.type ?? null,
      });

      return safeJson(res, 200, {
        ok: true,
        request: result.request,
        ledger: result.ledger,
      });
    } catch (err) {
      if (err && String(err.code || '').startsWith('MONEY_CORE_')) {
        return safeJson(res, err.statusCode || 403, {
          ok: false,
          error: err.code,
          message: err.message,
        });
      }
      if (err && err.statusCode) {
        return safeJson(res, err.statusCode, {
          ok: false,
          error: err.code || 'WITHDRAW_REQUEST_INVALID',
          message: err.message,
        });
      }
      return next(err);
    }
  });

  r.get('/salons/:slug/money-core/summary', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      const owner = await resolveMoneyCoreOwnerBySlug(pool, 'salon', req.params.slug);
      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      if (!hasMoneyCorePrivilegedAccess(req) && !hasMoneyCoreOwnerAccess(req, owner.owner_type, owner.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'MONEY_CORE_OWNER_ACCESS_REQUIRED',
        });
      }

      const summary = await buildOwnerMoneyCoreSummary(pool, {
        ownerType: 'salon',
        slug: req.params.slug,
      });

      if (!summary.ok) {
        return safeJson(res, summary.statusCode || 400, summary);
      }

      return safeJson(res, 200, summary);
    } catch (err) {
      return next(err);
    }
  });

  r.get('/masters/:slug/money-core/summary', async (req, res, next) => {
    try {
      if (!requireMoneyCoreAuth(res, req)) {
        return;
      }

      const owner = await resolveMoneyCoreOwnerBySlug(pool, 'master', req.params.slug);
      if (!owner.ok) {
        return safeJson(res, owner.statusCode || 400, {
          ok: false,
          error: owner.error,
        });
      }

      if (!hasMoneyCorePrivilegedAccess(req) && !hasMoneyCoreOwnerAccess(req, owner.owner_type, owner.owner_id)) {
        return safeJson(res, 403, {
          ok: false,
          error: 'MONEY_CORE_OWNER_ACCESS_REQUIRED',
        });
      }

      const summary = await buildOwnerMoneyCoreSummary(pool, {
        ownerType: 'master',
        slug: req.params.slug,
      });

      if (!summary.ok) {
        return safeJson(res, summary.statusCode || 400, summary);
      }

      return safeJson(res, 200, summary);
    } catch (err) {
      return next(err);
    }
  });

  return r;
}

export default buildMoneyCoreRouter;
