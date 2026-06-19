'use strict';

import { createLedgerEntriesForXpaySettlement } from './xpayLedgerBridge.service.js';

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeNumeric(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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
  const normalized = normalizeText(value);
  if (normalized && ['system', 'admin', 'owner', 'provider'].includes(normalized)) {
    return normalized;
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
      $1, $2, $3, $4, $5, $6, $7, $8, 'KGS', $9::jsonb
    )
    RETURNING *
    `,
    [
      normalizeText(payload.event_type),
      normalizeActorType(payload.actor_type),
      Number.isFinite(Number(payload.actor_id)) ? Number(payload.actor_id) : null,
      normalizeText(payload.owner_type),
      Number.isFinite(Number(payload.owner_id)) ? Number(payload.owner_id) : null,
      normalizeText(payload.source_type),
      Number.isFinite(Number(payload.source_id)) ? Number(payload.source_id) : null,
      normalizeNumeric(payload.amount, null),
      JSON.stringify(sanitizeJson(payload.data || {})),
    ]
  );

  return result.rows[0] || null;
}

function toSettlementRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    items: Array.isArray(row.items) ? row.items : [],
  };
}

async function fetchSettlementWithItems(pool, settlementId) {
  const settlementResult = await pool.query(
    `
    SELECT *
    FROM public.provider_settlements
    WHERE id = $1
    LIMIT 1
    `,
    [settlementId]
  );

  const settlement = settlementResult.rows[0];
  if (!settlement) {
    return null;
  }

  const itemsResult = await pool.query(
    `
    SELECT *
    FROM public.provider_settlement_items
    WHERE provider_settlement_id = $1
    ORDER BY id ASC
    `,
    [settlementId]
  );

  return toSettlementRow({
    ...settlement,
    items: itemsResult.rows,
  });
}

async function createManualSettlement(pool, input = {}, actor = {}) {
  const metadataJson = sanitizeJson(input.metadata_json ?? input.metadata ?? {});
  const bankReceivedAt = input.bank_received_at ?? null;
  const status = bankReceivedAt ? 'bank_received' : 'draft';
  const manualConfirmedBy =
    Number.isInteger(Number(actor.user_id)) && Number(actor.user_id) > 0
      ? Number(actor.user_id)
      : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertResult = await client.query(
      `
      INSERT INTO public.provider_settlements (
        provider_code,
        settlement_source,
        provider_settlement_id,
        status,
        amount_gross,
        amount_fee,
        amount_net,
        currency,
        hold_started_at,
        hold_until,
        settlement_eligible_at,
        requested_at,
        submitted_at,
        expected_bank_date,
        bank_received_at,
        bank_reference,
        manual_confirmed_by,
        manual_confirmed_at,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (
        COALESCE($1, 'manual'),
        COALESCE($2, 'manual'),
        $3,
        $4,
        GREATEST(COALESCE($5, 0), 0),
        GREATEST(COALESCE($6, 0), 0),
        GREATEST(COALESCE($7, 0), 0),
        'KGS',
        $8::timestamptz,
        $9::timestamptz,
        $10::timestamptz,
        $11::timestamptz,
        $12::timestamptz,
        $13::date,
        $14::timestamptz,
        $15,
        $16,
        CASE WHEN $14::timestamptz IS NOT NULL THEN now() ELSE NULL END,
        $17::jsonb,
        now(),
        now()
      )
      RETURNING id
      `,
      [
        normalizeText(input.provider_code) || 'manual',
        normalizeText(input.settlement_source) || 'manual',
        normalizeText(input.provider_settlement_id),
        status,
        normalizeNumeric(input.amount_gross, 0),
        normalizeNumeric(input.amount_fee, 0),
        normalizeNumeric(input.amount_net, 0),
        input.hold_started_at ?? null,
        input.hold_until ?? null,
        input.settlement_eligible_at ?? null,
        input.requested_at ?? null,
        input.submitted_at ?? null,
        input.expected_bank_date ?? null,
        bankReceivedAt,
        normalizeText(input.bank_reference),
        manualConfirmedBy,
        JSON.stringify(metadataJson),
      ]
    );

    await insertMoneyAuditEvent(client, {
      event_type: 'provider_settlement_created',
      actor_type: actor.user_type,
      actor_id: actor.user_id,
      owner_type: null,
      owner_id: null,
      source_type: 'provider_settlement',
      source_id: insertResult.rows[0].id,
      amount: normalizeNumeric(input.amount_net, 0),
      data: {
        provider_code: normalizeText(input.provider_code) || 'manual',
        settlement_source: normalizeText(input.settlement_source) || 'manual',
        provider_settlement_id: normalizeText(input.provider_settlement_id),
        status,
        amount_gross: normalizeNumeric(input.amount_gross, 0),
        amount_fee: normalizeNumeric(input.amount_fee, 0),
        amount_net: normalizeNumeric(input.amount_net, 0),
        bank_reference: normalizeText(input.bank_reference),
        metadata: metadataJson,
      },
    });

    const settlement = await fetchSettlementWithItems(client, insertResult.rows[0].id);
    await client.query('COMMIT');
    return settlement;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function listProviderSettlements(pool, filters = {}) {
  const where = [];
  const values = [];
  let index = 1;

  if (filters.provider_code) {
    where.push(`provider_code = $${index++}`);
    values.push(normalizeText(filters.provider_code));
  }

  if (filters.status) {
    where.push(`status = $${index++}`);
    values.push(normalizeText(filters.status));
  }

  if (filters.settlement_source) {
    where.push(`settlement_source = $${index++}`);
    values.push(normalizeText(filters.settlement_source));
  }

  const limit = Math.min(
    Math.max(Number.parseInt(filters.limit, 10) || 100, 1),
    500
  );
  const offset = Math.max(Number.parseInt(filters.offset, 10) || 0, 0);

  values.push(limit);
  const limitIndex = index++;
  values.push(offset);
  const offsetIndex = index++;

  const query = `
    SELECT *
    FROM public.provider_settlements
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY created_at DESC, id DESC
    LIMIT $${limitIndex}
    OFFSET $${offsetIndex}
  `;

  const result = await pool.query(query, values);
  return result.rows;
}

async function getProviderSettlementById(pool, id) {
  const settlementId = Number(id);
  if (!Number.isInteger(settlementId) || settlementId <= 0) {
    return null;
  }

  return fetchSettlementWithItems(pool, settlementId);
}

async function confirmBankReceived(pool, id, input = {}, actor = {}) {
  const settlementId = Number(id);
  if (!Number.isInteger(settlementId) || settlementId <= 0) {
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const settlementResult = await client.query(
      `
      UPDATE public.provider_settlements
      SET
        status = 'bank_received',
        bank_received_at = COALESCE($2::timestamptz, now()),
        bank_reference = COALESCE($3, bank_reference),
        manual_confirmed_by = COALESCE($4, manual_confirmed_by),
        manual_confirmed_at = now(),
        updated_at = now()
      WHERE id = $1
      RETURNING id
      `,
      [
        settlementId,
        input.bank_received_at ?? null,
        normalizeText(input.bank_reference),
        Number.isInteger(Number(actor.user_id)) && Number(actor.user_id) > 0 ? Number(actor.user_id) : null,
      ]
    );

    if (!settlementResult.rows[0]) {
      await client.query('COMMIT');
      return null;
    }

    const settlement = await fetchSettlementWithItems(client, settlementId);
    await insertMoneyAuditEvent(client, {
      event_type: 'provider_settlement_bank_received',
      actor_type: actor.user_type,
      actor_id: actor.user_id,
      owner_type: null,
      owner_id: null,
      source_type: 'provider_settlement',
      source_id: settlementResult.rows[0].id,
      amount: normalizeNumeric(settlement?.amount_net, null),
      data: {
        settlement,
        bank_received_at: input.bank_received_at ?? null,
        bank_reference: normalizeText(input.bank_reference),
        manual_confirmed_by: Number.isInteger(Number(actor.user_id)) && Number(actor.user_id) > 0 ? Number(actor.user_id) : null,
      },
    });

    if (String(settlement?.provider_code || '').trim().toLowerCase() === 'xpay') {
      await createLedgerEntriesForXpaySettlement(client, {
        providerSettlementId: settlement.id,
        actor: {
          user_type: actor.user_type,
          user_id: actor.user_id,
        },
        route: '/money-core/settlements/:id/confirm-bank-received',
        reason: 'provider_settlement_bank_received',
      });
    }

    await client.query('COMMIT');
    return settlement;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function failProviderSettlement(pool, id, input = {}, actor = {}) {
  const settlementId = Number(id);
  if (!Number.isInteger(settlementId) || settlementId <= 0) {
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const settlementResult = await client.query(
      `
      UPDATE public.provider_settlements
      SET
        status = 'failed',
        metadata_json = COALESCE(metadata_json, '{}'::jsonb) || jsonb_build_object('failure_reason', COALESCE($2, 'UNKNOWN_FAILURE')),
        updated_at = now()
      WHERE id = $1
      RETURNING id
      `,
      [settlementId, normalizeText(input.failure_reason) || 'UNKNOWN_FAILURE']
    );

    if (!settlementResult.rows[0]) {
      await client.query('COMMIT');
      return null;
    }

    const settlement = await fetchSettlementWithItems(client, settlementId);
    await insertMoneyAuditEvent(client, {
      event_type: 'provider_settlement_failed',
      actor_type: actor.user_type,
      actor_id: actor.user_id,
      owner_type: null,
      owner_id: null,
      source_type: 'provider_settlement',
      source_id: settlementResult.rows[0].id,
      amount: normalizeNumeric(settlement?.amount_net, null),
      data: {
        settlement,
        failure_reason: normalizeText(input.failure_reason) || 'UNKNOWN_FAILURE',
      },
    });
    await client.query('COMMIT');
    return settlement;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

export {
  createManualSettlement,
  listProviderSettlements,
  getProviderSettlementById,
  confirmBankReceived,
  failProviderSettlement,
};
