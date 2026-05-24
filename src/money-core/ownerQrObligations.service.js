'use strict';

const ALLOWED_OWNER_TYPES = new Set(['salon', 'master', 'system']);

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

function normalizePositiveInt(value) {
  const numeric = normalizeInt(value);
  return numeric && numeric > 0 ? numeric : null;
}

function normalizeOwner(ownerType, ownerId) {
  const normalizedOwnerType = normalizeText(ownerType);
  const normalizedOwnerId = normalizePositiveInt(ownerId);

  if (!normalizedOwnerType || !ALLOWED_OWNER_TYPES.has(normalizedOwnerType)) {
    const error = new Error('Invalid owner_type');
    error.code = 'OWNER_QR_FORBIDDEN';
    error.statusCode = 403;
    throw error;
  }

  if (!normalizedOwnerId) {
    const error = new Error('Invalid owner_id');
    error.code = 'OWNER_QR_FORBIDDEN';
    error.statusCode = 403;
    throw error;
  }

  return {
    owner_type: normalizedOwnerType,
    owner_id: normalizedOwnerId,
  };
}

function normalizeObligationRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    payment_id: row.payment_id,
    booking_id: row.booking_id ?? null,
    from_owner_type: row.from_owner_type,
    from_owner_id: row.from_owner_id,
    to_owner_type: row.to_owner_type,
    to_owner_id: row.to_owner_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    obligation_type: row.obligation_type,
    split_role: row.split_role ?? null,
    created_at: row.created_at,
  };
}

async function listOwnerObligations(pool, { ownerType, ownerId }) {
  const owner = normalizeOwner(ownerType, ownerId);

  const result = await pool.query(
    `
    SELECT
      id,
      payment_id,
      booking_id,
      from_owner_type,
      from_owner_id,
      to_owner_type,
      to_owner_id,
      amount,
      currency,
      status,
      obligation_type,
      split_role,
      created_at
    FROM public.money_owner_obligations
    WHERE (from_owner_type = $1 AND from_owner_id = $2)
       OR (to_owner_type = $1 AND to_owner_id = $2)
    ORDER BY created_at DESC, id DESC
    `,
    [owner.owner_type, owner.owner_id]
  );

  const rows = result.rows.map(normalizeObligationRow);

  let outgoingOpenTotal = 0;
  let incomingOpenTotal = 0;

  for (const row of rows) {
    if (!row || String(row.status || '').toLowerCase() !== 'open') {
      continue;
    }

    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) {
      continue;
    }

    if (
      String(row.from_owner_type || '') === owner.owner_type
      && Number(row.from_owner_id) === owner.owner_id
    ) {
      outgoingOpenTotal += amount;
    }

    if (
      String(row.to_owner_type || '') === owner.owner_type
      && Number(row.to_owner_id) === owner.owner_id
    ) {
      incomingOpenTotal += amount;
    }
  }

  return {
    owner_type: owner.owner_type,
    owner_id: owner.owner_id,
    outgoing_open_total: outgoingOpenTotal,
    incoming_open_total: incomingOpenTotal,
    rows,
  };
}

export {
  listOwnerObligations,
};
