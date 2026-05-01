'use strict';

import express from 'express';
import { getMoneyCoreFlags } from '../../money-core/config.js';
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
  listWithdrawRequests,
  getWithdrawRequestById,
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

function buildMoneyCoreRouter(pool) {
  const r = express.Router();

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
      const settlement = await getProviderSettlementById(pool, req.params.id);

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
      return next(err);
    }
  });

  r.post('/money-core/settlements/manual', async (req, res, next) => {
    try {
      const settlement = await createManualSettlement(pool, req.body || {}, {
        user_id: req.user?.id ?? req.user?.user_id ?? null,
      });

      return safeJson(res, 200, {
        ok: true,
        settlement,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.post('/money-core/settlements/:id/confirm-bank-received', async (req, res, next) => {
    try {
      const settlement = await confirmBankReceived(
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
      return next(err);
    }
  });

  r.post('/money-core/settlements/:id/fail', async (req, res, next) => {
    try {
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
      return next(err);
    }
  });

  r.get('/money-core/split-allocations', async (req, res, next) => {
    try {
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
      const allocation = await getSplitAllocationById(pool, req.params.id);

      if (!allocation) {
        return safeJson(res, 404, {
          ok: false,
          error: 'SPLIT_ALLOCATION_NOT_FOUND',
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
      return next(err);
    }
  });

  r.get('/money-core/ledger/:id', async (req, res, next) => {
    try {
      const entry = await getMoneyLedgerEntryById(pool, req.params.id);

      if (!entry) {
        return safeJson(res, 404, {
          ok: false,
          error: 'MONEY_LEDGER_ENTRY_NOT_FOUND',
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
      const destination = await getWithdrawDestinationById(pool, req.params.id);
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
      return next(err);
    }
  });

  r.patch('/money-core/withdraw-destinations/:id', async (req, res, next) => {
    try {
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
      const request = await getWithdrawRequestById(pool, req.params.id);

      if (!request) {
        return safeJson(res, 404, {
          ok: false,
          error: 'WITHDRAW_REQUEST_NOT_FOUND',
        });
      }

      return safeJson(res, 200, {
        ok: true,
        request,
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/payout-executions', async (req, res, next) => {
    try {
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
      const payout = await getPayoutExecutionById(pool, req.params.id);

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
      return next(err);
    }
  });

  r.post('/money-core/payout-executions', async (req, res, next) => {
    try {
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

  r.get('/money-core/admin/overview', async (req, res, next) => {
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

  r.get('/money-core/admin/owner-balances', async (req, res, next) => {
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

  r.get('/money-core/admin/withdraw-requests', async (req, res, next) => {
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
      return safeJson(res, 200, { ok: true, data, meta: {} });
    } catch (err) {
      return next(err);
    }
  });

  r.get('/money-core/admin/payout-executions', async (req, res, next) => {
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

  r.get('/money-core/admin/reconciliation', async (req, res, next) => {
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

  r.get('/money-core/admin/exceptions', async (req, res, next) => {
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

  r.get('/money-core/admin/provider-events', async (req, res, next) => {
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

  r.get('/money-core/admin/settlements', async (req, res, next) => {
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

  r.get('/money-core/admin/receipts', async (req, res, next) => {
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

  r.get('/money-core/admin/audit-events', async (req, res, next) => {
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

  r.get('/salons/:slug/money-core/summary', async (req, res, next) => {
    try {
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
