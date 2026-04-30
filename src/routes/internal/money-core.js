'use strict';

import express from 'express';
import { getMoneyCoreFlags } from '../../money-core/config.js';

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

  return r;
}

export default buildMoneyCoreRouter;
