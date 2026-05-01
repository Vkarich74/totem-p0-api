'use strict';

import { assertMoneyCoreWriteAllowed } from './config.js';

const ALLOWED_RUN_TYPES = new Set([
  'provider_payments',
  'provider_settlements',
  'bank_statement',
  'ledger_balance',
  'withdraws_payouts',
  'full',
]);

const ALLOWED_RUN_STATUSES = new Set([
  'pending',
  'running',
  'completed',
  'completed_with_mismatches',
  'failed',
]);

const ALLOWED_MISMATCH_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const ALLOWED_MISMATCH_STATUSES = new Set(['open', 'requires_review', 'resolved', 'ignored']);

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

function normalizeActorType(value) {
  const normalized = normalizeText(value);
  if (normalized && ['system', 'admin', 'owner', 'provider'].includes(normalized)) {
    return normalized;
  }
  return 'system';
}

function sanitizeAuditJson(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
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
      normalizeText(payload.event_type),
      normalizeActorType(payload.actor_type),
      normalizeInt(payload.actor_id),
      normalizeText(payload.owner_type),
      normalizeInt(payload.owner_id),
      normalizeText(payload.source_type),
      normalizeInt(payload.source_id),
      null,
      JSON.stringify(sanitizeAuditJson(payload.data || {})),
    ]
  );

  return result.rows[0] || null;
}

function safePagination(filters = {}) {
  const limit = Math.min(Math.max(Number.parseInt(filters.limit, 10) || 100, 1), 500);
  const offset = Math.max(Number.parseInt(filters.offset, 10) || 0, 0);
  return { limit, offset };
}

async function listReconciliationRuns(pool, filters = {}) {
  const where = [];
  const values = [];
  let index = 1;

  if (filters.run_type) {
    where.push(`run_type = $${index++}`);
    values.push(normalizeText(filters.run_type));
  }

  if (filters.status) {
    where.push(`status = $${index++}`);
    values.push(normalizeText(filters.status));
  }

  if (filters.provider_code) {
    where.push(`provider_code = $${index++}`);
    values.push(normalizeText(filters.provider_code));
  }

  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index++;
  values.push(offset);
  const offsetIndex = index++;

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

async function getReconciliationRunById(pool, id) {
  const runId = normalizeInt(id);
  if (!runId || runId <= 0) {
    return null;
  }

  const runResult = await pool.query(
    `
    SELECT *
    FROM public.money_reconciliation_runs
    WHERE id = $1
    LIMIT 1
    `,
    [runId]
  );

  const run = runResult.rows[0];
  if (!run) {
    return null;
  }

  const mismatchesResult = await pool.query(
    `
    SELECT *
    FROM public.money_reconciliation_mismatches
    WHERE run_id = $1
    ORDER BY id ASC
    `,
    [runId]
  );

  return {
    run,
    mismatches: mismatchesResult.rows,
  };
}

async function listReconciliationMismatches(pool, filters = {}) {
  const where = [];
  const values = [];
  let index = 1;

  if (filters.run_id !== undefined && filters.run_id !== null && filters.run_id !== '') {
    where.push(`run_id = $${index++}`);
    values.push(normalizeInt(filters.run_id));
  }

  if (filters.severity) {
    where.push(`severity = $${index++}`);
    values.push(normalizeText(filters.severity));
  }

  if (filters.status) {
    where.push(`status = $${index++}`);
    values.push(normalizeText(filters.status));
  }

  if (filters.source_type) {
    where.push(`source_type = $${index++}`);
    values.push(normalizeText(filters.source_type));
  }

  if (filters.source_id !== undefined && filters.source_id !== null && filters.source_id !== '') {
    where.push(`source_id = $${index++}`);
    values.push(normalizeInt(filters.source_id));
  }

  const { limit, offset } = safePagination(filters);
  values.push(limit);
  const limitIndex = index++;
  values.push(offset);
  const offsetIndex = index++;

  const result = await pool.query(
    `
    SELECT *
    FROM public.money_reconciliation_mismatches
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
    `,
    values
  );

  return result.rows;
}

function validateRunType(runType) {
  const normalized = normalizeText(runType) || 'full';
  if (!ALLOWED_RUN_TYPES.has(normalized)) {
    const error = new Error('Invalid run_type');
    error.code = 'RECONCILIATION_RUN_TYPE_INVALID';
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function validateMismatchStatus(status) {
  const normalized = normalizeText(status);
  if (!normalized || !ALLOWED_MISMATCH_STATUSES.has(normalized)) {
    const error = new Error('Invalid mismatch status');
    error.code = 'RECONCILIATION_MISMATCH_STATUS_INVALID';
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

async function runReconciliation(pool, input = {}, actor = {}) {
  assertMoneyCoreWriteAllowed();

  const runType = validateRunType(input.run_type);
  const providerCode = normalizeText(input.provider_code);
  const client = await pool.connect();
  let runId = null;

  try {
    await client.query('BEGIN');

    const runInsert = await client.query(
      `
      INSERT INTO public.money_reconciliation_runs (
        run_type,
        period_start,
        period_end,
        provider_code,
        status,
        payments_checked,
        settlements_checked,
        ledger_checked,
        withdraws_checked,
        payouts_checked,
        mismatches_count,
        started_at,
        completed_at,
        created_by,
        created_at
      ) VALUES (
        $1, $2, $3, $4, 'running', 0, 0, 0, 0, 0, 0, now(), NULL, $5, now()
      )
      RETURNING *
      `,
      [
        runType,
        input.period_start ?? null,
        input.period_end ?? null,
        providerCode,
        normalizeInt(actor.user_id),
      ]
    );

    runId = runInsert.rows[0].id;
    const mismatchInserts = [];
    let ledgerChecked = 0;
    let withdrawsChecked = 0;
    let payoutsChecked = 0;

    if (runType === 'ledger_balance' || runType === 'full') {
      const projectionResult = await client.query(
        `
        WITH ledger_totals AS (
          SELECT
            owner_type,
            owner_id,
            currency,
            money_zone,
            SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END) AS ledger_amount
          FROM public.money_ledger_entries
          GROUP BY owner_type, owner_id, currency, money_zone
        )
        SELECT
          b.id AS balance_id,
          b.owner_type,
          b.owner_id,
          b.currency,
          z.money_zone,
          COALESCE(lt.ledger_amount, 0) AS expected_amount,
          CASE z.money_zone
            WHEN 'provider_hold' THEN b.provider_hold
            WHEN 'pending_settlement' THEN b.pending_settlement
            WHEN 'available' THEN b.available
            WHEN 'locked' THEN b.locked
            WHEN 'paid_out' THEN b.paid_out
            WHEN 'refunded' THEN b.refunded
            WHEN 'reversed' THEN b.reversed
            WHEN 'fee_reserved' THEN b.fee_reserved
            WHEN 'commission' THEN b.commission
            WHEN 'requires_review' THEN b.requires_review
          END AS actual_amount
        FROM public.money_owner_balances b
        CROSS JOIN (
          VALUES
            ('provider_hold'),
            ('pending_settlement'),
            ('available'),
            ('locked'),
            ('paid_out'),
            ('refunded'),
            ('reversed'),
            ('fee_reserved'),
            ('commission'),
            ('requires_review')
        ) AS z(money_zone)
        LEFT JOIN ledger_totals lt
          ON lt.owner_type = b.owner_type
         AND lt.owner_id = b.owner_id
         AND lt.currency = b.currency
         AND lt.money_zone = z.money_zone
        ORDER BY b.id ASC
        `,
        []
      );

      ledgerChecked = projectionResult.rows.length;

      for (const row of projectionResult.rows) {
        if (Number(row.expected_amount) !== Number(row.actual_amount)) {
          const mismatchResult = await client.query(
            `
            INSERT INTO public.money_reconciliation_mismatches (
              run_id,
              severity,
              mismatch_type,
              source_type,
              source_id,
              expected_amount,
              actual_amount,
              expected_status,
              actual_status,
              status,
              created_at
            ) VALUES (
              $1, 'high', 'ledger_balance_mismatch', 'money_owner_balance', $2, $3, $4, $5, 'balance_projection', 'open', now()
            )
            RETURNING *
            `,
            [
              runId,
              row.balance_id,
              row.expected_amount,
              row.actual_amount,
              row.money_zone,
            ]
          );
          mismatchInserts.push(mismatchResult.rows[0]);
        }
      }
    }

    if (runType === 'withdraws_payouts' || runType === 'full') {
      const payoutResult = await client.query(
        `
        SELECT pe.*, wr.status AS withdraw_status
        FROM public.payout_executions pe
        LEFT JOIN public.withdraw_requests wr
          ON wr.id = pe.withdraw_request_id
        WHERE pe.status = 'completed'
        ORDER BY pe.id ASC
        `
      );

      payoutsChecked = payoutResult.rows.length;

      for (const row of payoutResult.rows) {
        if (String(row.withdraw_status || '').trim().toLowerCase() !== 'completed') {
          const mismatchResult = await client.query(
            `
            INSERT INTO public.money_reconciliation_mismatches (
              run_id,
              severity,
              mismatch_type,
              source_type,
              source_id,
              expected_amount,
              actual_amount,
              expected_status,
              actual_status,
              status,
              created_at
            ) VALUES (
              $1, 'high', 'payout_completed_withdraw_not_completed', 'payout_execution', $2, NULL, NULL, 'completed', $3, 'open', now()
            )
            RETURNING *
            `,
            [
              runId,
              row.id,
              row.withdraw_status || null,
            ]
          );
          mismatchInserts.push(mismatchResult.rows[0]);
        }

        if (!row.external_ref && !row.bank_reference) {
          const mismatchResult = await client.query(
            `
            INSERT INTO public.money_reconciliation_mismatches (
              run_id,
              severity,
              mismatch_type,
              source_type,
              source_id,
              expected_amount,
              actual_amount,
              expected_status,
              actual_status,
              status,
              created_at
            ) VALUES (
              $1, 'critical', 'payout_completed_without_proof', 'payout_execution', $2, NULL, NULL, 'proof_required', 'missing', 'open', now()
            )
            RETURNING *
            `,
            [
              runId,
              row.id,
            ]
          );
          mismatchInserts.push(mismatchResult.rows[0]);
        }
      }
    }

    const mismatchesCount = mismatchInserts.length;
    const completedStatus = mismatchesCount > 0 ? 'completed_with_mismatches' : 'completed';

      const runUpdate = await client.query(
        `
        UPDATE public.money_reconciliation_runs
      SET
        status = $2,
        payments_checked = $3,
        settlements_checked = $4,
        ledger_checked = $5,
        withdraws_checked = $6,
        payouts_checked = $7,
        mismatches_count = $8,
        completed_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [
        runId,
        completedStatus,
        0,
        0,
        ledgerChecked,
        withdrawsChecked,
        payoutsChecked,
        mismatchesCount,
        ]
      );

      await insertMoneyAuditEvent(client, {
        event_type: 'reconciliation_run_completed',
        actor_type: actor.user_type,
        actor_id: actor.user_id,
        owner_type: null,
        owner_id: null,
        source_type: 'money_reconciliation_run',
        source_id: runUpdate.rows[0].id,
        amount: null,
        data: {
          run: runUpdate.rows[0],
          run_type: runType,
          provider_code: providerCode,
          ledger_checked: ledgerChecked,
          withdraws_checked: withdrawsChecked,
          payouts_checked: payoutsChecked,
          mismatches_count: mismatchesCount,
          mismatch_ids: mismatchInserts.map((row) => row.id),
        },
      });

      await client.query('COMMIT');
      return {
        run: runUpdate.rows[0],
      mismatches: mismatchInserts,
    };
  } catch (error) {
    try {
      if (runId) {
        await client.query(
          `
          UPDATE public.money_reconciliation_runs
          SET status = 'failed', completed_at = now()
          WHERE id = $1
          `,
          [runId]
        );
        await client.query('COMMIT');
      } else {
        await client.query('ROLLBACK');
      }
    } catch (_) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        // ignore rollback failure
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

async function resolveReconciliationMismatch(pool, id, input = {}, actor = {}) {
  assertMoneyCoreWriteAllowed();

  const mismatchId = normalizeInt(id);
  if (!mismatchId || mismatchId <= 0) {
    return null;
  }

  const status = validateMismatchStatus(input.status);
  const resolutionNote = normalizeText(input.resolution_note);
  if (!resolutionNote) {
    const error = new Error('resolution_note is required');
    error.code = 'RECONCILIATION_RESOLUTION_NOTE_REQUIRED';
    error.statusCode = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
      UPDATE public.money_reconciliation_mismatches
      SET
        status = $2,
        resolution_note = $3,
        resolved_by = $4,
        resolved_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [mismatchId, status, resolutionNote, normalizeInt(actor.user_id)]
    );

    await client.query('COMMIT');
    return result.rows[0] || null;
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
  listReconciliationRuns,
  getReconciliationRunById,
  listReconciliationMismatches,
  runReconciliation,
  resolveReconciliationMismatch,
};
