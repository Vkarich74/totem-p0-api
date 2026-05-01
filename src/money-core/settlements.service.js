'use strict';

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
