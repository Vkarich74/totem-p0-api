'use strict';

import { assertMoneyCoreWriteAllowed } from './config.js';

const ALLOWED_OWNER_TYPES = new Set(['salon', 'master', 'platform', 'system']);
const ALLOWED_METHODS = new Set(['wallet', 'card', 'bank_account', 'manual_other']);
const ALLOWED_DESTINATION_RELATIONS = new Set([
  'self',
  'company_account',
  'authorized_person',
  'third_party',
  'unknown',
]);
const ALLOWED_DESTINATION_STATUSES = new Set([
  'unverified',
  'active',
  'requires_review',
  'blocked',
  'archived',
]);
const ALLOWED_SETTINGS_MODES = new Set([
  'manual_only',
  'auto_if_green',
  'admin_review_only',
  'disabled',
]);
const ALLOWED_AMOUNT_MODES = new Set([
  'all_available',
  'fixed_amount',
  'up_to_limit',
  'leave_min_balance',
]);
const ALLOWED_SCHEDULE_FREQUENCIES = new Set([
  'daily',
  'weekly',
  'twice_per_month',
  'monthly',
  'custom',
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

function normalizeBool(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function normalizeNumeric(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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

function normalizeKgPhone(phone) {
  const raw = String(phone ?? '').trim().replace(/[\s()-]/g, '');
  if (!raw) {
    return null;
  }

  if (/^\+996\d{9}$/.test(raw)) {
    return raw;
  }

  if (/^996\d{9}$/.test(raw)) {
    return `+${raw}`;
  }

  if (/^0\d{9}$/.test(raw)) {
    return `+996${raw.slice(1)}`;
  }

  const error = new Error('Invalid KG phone');
  error.code = 'INVALID_KG_PHONE';
  error.statusCode = 400;
  throw error;
}

function normalizeOwner(ownerType, ownerId) {
  const normalizedOwnerType = normalizeText(ownerType);
  const normalizedOwnerId = normalizeInt(ownerId);

  if (!normalizedOwnerType || !ALLOWED_OWNER_TYPES.has(normalizedOwnerType)) {
    const error = new Error('Invalid owner_type');
    error.code = 'WITHDRAW_OWNER_TYPE_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!normalizedOwnerId || normalizedOwnerId <= 0) {
    const error = new Error('Invalid owner_id');
    error.code = 'WITHDRAW_OWNER_ID_INVALID';
    error.statusCode = 400;
    throw error;
  }

  return { owner_type: normalizedOwnerType, owner_id: normalizedOwnerId };
}

function normalizeDestinationProviderFilters(filters = {}) {
  return {
    method: normalizeText(filters.method),
    enabled: normalizeBool(filters.enabled, null),
    country: normalizeText(filters.country),
  };
}

async function listDestinationProviders(pool, filters = {}) {
  const normalized = normalizeDestinationProviderFilters(filters);
  const where = [];
  const values = [];
  let index = 1;

  if (normalized.method) {
    where.push(`method = $${index++}`);
    values.push(normalized.method);
  }

  if (normalized.enabled !== null) {
    where.push(`enabled = $${index++}`);
    values.push(normalized.enabled);
  }

  if (normalized.country) {
    where.push(`country = $${index++}`);
    values.push(normalized.country);
  }

  const result = await pool.query(
    `
    SELECT *
    FROM public.destination_providers
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY code ASC
    `,
    values
  );

  return result.rows;
}

async function listWithdrawDestinations(pool, ownerType, ownerId, filters = {}) {
  const owner = normalizeOwner(ownerType, ownerId);
  const where = ['owner_type = $1', 'owner_id = $2'];
  const values = [owner.owner_type, owner.owner_id];
  let index = 3;

  if (filters.method) {
    where.push(`method = $${index++}`);
    values.push(normalizeText(filters.method));
  }

  if (filters.status) {
    where.push(`status = $${index++}`);
    values.push(normalizeText(filters.status));
  }

  const result = await pool.query(
    `
    SELECT *
    FROM public.withdraw_destinations
    WHERE ${where.join(' AND ')}
    ORDER BY id DESC
    `,
    values
  );

  return result.rows;
}

async function getWithdrawDestinationById(pool, id) {
  const destinationId = normalizeInt(id);
  if (!destinationId || destinationId <= 0) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT *
    FROM public.withdraw_destinations
    WHERE id = $1
    LIMIT 1
    `,
    [destinationId]
  );

  return result.rows[0] || null;
}

function validateDestinationInput(input = {}) {
  const ownerType = normalizeText(input.owner_type);
  const ownerId = normalizeInt(input.owner_id);
  const method = normalizeText(input.method);

  if (!ownerType || !ALLOWED_OWNER_TYPES.has(ownerType)) {
    const error = new Error('Invalid owner_type');
    error.code = 'WITHDRAW_OWNER_TYPE_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!ownerId || ownerId <= 0) {
    const error = new Error('Invalid owner_id');
    error.code = 'WITHDRAW_OWNER_ID_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!method || !ALLOWED_METHODS.has(method)) {
    const error = new Error('Invalid method');
    error.code = 'WITHDRAW_METHOD_INVALID';
    error.statusCode = 400;
    throw error;
  }

  const normalized = {
    owner_type: ownerType,
    owner_id: ownerId,
    method,
    provider_code: normalizeText(input.provider_code),
    wallet_provider: normalizeText(input.wallet_provider),
    phone: normalizeText(input.phone),
    bank_name: normalizeText(input.bank_name),
    account_masked: normalizeText(input.account_masked),
    card_last4: normalizeText(input.card_last4),
    account_holder: normalizeText(input.account_holder),
    destination_relation: normalizeText(input.destination_relation) || 'unknown',
    payload_sanitized: sanitizeJson(input.payload_sanitized ?? input.payload ?? {}),
    provider_token: null,
    status: normalizeText(input.status) || 'unverified',
  };

  if (!ALLOWED_DESTINATION_RELATIONS.has(normalized.destination_relation)) {
    const error = new Error('Invalid destination_relation');
    error.code = 'WITHDRAW_DESTINATION_RELATION_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!normalized.status) {
    normalized.status = 'unverified';
  }

  if (!ALLOWED_DESTINATION_STATUSES.has(normalized.status)) {
    const error = new Error('Invalid destination status');
    error.code = 'WITHDRAW_DESTINATION_STATUS_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (normalized.method === 'wallet') {
    if (!normalized.wallet_provider || !normalized.phone) {
      const error = new Error('wallet_provider and phone are required for wallet destinations');
      error.code = 'WITHDRAW_WALLET_FIELDS_REQUIRED';
      error.statusCode = 400;
      throw error;
    }

    normalized.phone = normalizeKgPhone(normalized.phone);
  } else if (normalized.phone) {
    normalized.phone = normalizeKgPhone(normalized.phone);
  }

  return normalized;
}

async function createWithdrawDestination(pool, ownerType, ownerId, input = {}, actor = {}) {
  assertMoneyCoreWriteAllowed();
  const owner = normalizeOwner(ownerType, ownerId);
  const normalized = validateDestinationInput({
    ...input,
    owner_type: owner.owner_type,
    owner_id: owner.owner_id,
  });

  const result = await pool.query(
    `
    INSERT INTO public.withdraw_destinations (
      owner_type,
      owner_id,
      method,
      provider_code,
      wallet_provider,
      phone,
      bank_name,
      account_masked,
      card_last4,
      account_holder,
      destination_relation,
      payload_sanitized,
      provider_token,
      status,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, now(), now()
    )
    RETURNING *
    `,
    [
      normalized.owner_type,
      normalized.owner_id,
      normalized.method,
      normalized.provider_code,
      normalized.wallet_provider,
      normalized.phone,
      normalized.bank_name,
      normalized.account_masked,
      normalized.card_last4,
      normalized.account_holder,
      normalized.destination_relation,
      JSON.stringify(normalized.payload_sanitized),
      normalized.provider_token,
      normalized.status,
    ]
  );

  return result.rows[0] || null;
}

async function updateWithdrawDestination(pool, id, input = {}, actor = {}) {
  assertMoneyCoreWriteAllowed();
  const destinationId = normalizeInt(id);
  if (!destinationId || destinationId <= 0) {
    return null;
  }

  const current = await getWithdrawDestinationById(pool, destinationId);
  if (!current) {
    return null;
  }

  const next = {
    provider_code: input.provider_code !== undefined ? normalizeText(input.provider_code) : current.provider_code,
    wallet_provider: input.wallet_provider !== undefined ? normalizeText(input.wallet_provider) : current.wallet_provider,
    phone: input.phone !== undefined ? normalizeText(input.phone) : current.phone,
    bank_name: input.bank_name !== undefined ? normalizeText(input.bank_name) : current.bank_name,
    account_masked: input.account_masked !== undefined ? normalizeText(input.account_masked) : current.account_masked,
    card_last4: input.card_last4 !== undefined ? normalizeText(input.card_last4) : current.card_last4,
    account_holder: input.account_holder !== undefined ? normalizeText(input.account_holder) : current.account_holder,
    destination_relation:
      input.destination_relation !== undefined
        ? normalizeText(input.destination_relation) || 'unknown'
        : current.destination_relation,
    payload_sanitized:
      input.payload_sanitized !== undefined || input.payload !== undefined
        ? sanitizeJson(input.payload_sanitized ?? input.payload ?? {})
        : current.payload_sanitized,
    status: input.status !== undefined ? normalizeText(input.status) : current.status,
  };

  if (!ALLOWED_DESTINATION_RELATIONS.has(next.destination_relation)) {
    const error = new Error('Invalid destination_relation');
    error.code = 'WITHDRAW_DESTINATION_RELATION_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!ALLOWED_DESTINATION_STATUSES.has(next.status)) {
    const error = new Error('Invalid destination status');
    error.code = 'WITHDRAW_DESTINATION_STATUS_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (current.method === 'wallet' || next.wallet_provider || next.phone) {
    if (!next.wallet_provider || !next.phone) {
      const error = new Error('wallet_provider and phone are required for wallet destinations');
      error.code = 'WITHDRAW_WALLET_FIELDS_REQUIRED';
      error.statusCode = 400;
      throw error;
    }

    next.phone = normalizeKgPhone(next.phone);
  }

  const result = await pool.query(
    `
    UPDATE public.withdraw_destinations
    SET
      provider_code = $2,
      wallet_provider = $3,
      phone = $4,
      bank_name = $5,
      account_masked = $6,
      card_last4 = $7,
      account_holder = $8,
      destination_relation = $9,
      payload_sanitized = $10::jsonb,
      status = $11,
      updated_at = now()
    WHERE id = $1
    RETURNING *
    `,
    [
      destinationId,
      next.provider_code,
      next.wallet_provider,
      next.phone,
      next.bank_name,
      next.account_masked,
      next.card_last4,
      next.account_holder,
      next.destination_relation,
      JSON.stringify(next.payload_sanitized),
      next.status,
    ]
  );

  return result.rows[0] || null;
}

async function archiveWithdrawDestination(pool, id, actor = {}) {
  assertMoneyCoreWriteAllowed();
  const destinationId = normalizeInt(id);
  if (!destinationId || destinationId <= 0) {
    return null;
  }

  const result = await pool.query(
    `
    UPDATE public.withdraw_destinations
    SET status = 'archived', updated_at = now()
    WHERE id = $1
    RETURNING *
    `,
    [destinationId]
  );

  return result.rows[0] || null;
}

async function getWithdrawSettings(pool, ownerType, ownerId) {
  const owner = normalizeOwner(ownerType, ownerId);
  const result = await pool.query(
    `
    SELECT *
    FROM public.withdraw_settings
    WHERE owner_type = $1
      AND owner_id = $2
    LIMIT 1
    `,
    [owner.owner_type, owner.owner_id]
  );

  if (result.rows[0]) {
    return result.rows[0];
  }

  return {
    owner_type: owner.owner_type,
    owner_id: owner.owner_id,
    mode: 'manual_only',
    schedule_enabled: false,
    amount_mode: 'all_available',
    auto_submit_enabled: false,
    requires_admin_review: true,
  };
}

async function upsertWithdrawSettings(pool, ownerType, ownerId, input = {}, actor = {}) {
  assertMoneyCoreWriteAllowed();
  const owner = normalizeOwner(ownerType, ownerId);

  const mode = normalizeText(input.mode) || 'manual_only';
  const amountMode = normalizeText(input.amount_mode) || 'all_available';
  const scheduleFrequency = input.schedule_frequency !== undefined ? normalizeText(input.schedule_frequency) : null;
  const scheduleDay = input.schedule_day !== undefined && input.schedule_day !== null && input.schedule_day !== ''
    ? Number(input.schedule_day)
    : null;

  if (!ALLOWED_SETTINGS_MODES.has(mode)) {
    const error = new Error('Invalid mode');
    error.code = 'WITHDRAW_SETTINGS_MODE_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (!ALLOWED_AMOUNT_MODES.has(amountMode)) {
    const error = new Error('Invalid amount_mode');
    error.code = 'WITHDRAW_SETTINGS_AMOUNT_MODE_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (scheduleFrequency !== null && !ALLOWED_SCHEDULE_FREQUENCIES.has(scheduleFrequency)) {
    const error = new Error('Invalid schedule_frequency');
    error.code = 'WITHDRAW_SETTINGS_SCHEDULE_FREQUENCY_INVALID';
    error.statusCode = 400;
    throw error;
  }

  if (scheduleDay !== null && (!Number.isInteger(scheduleDay) || scheduleDay < 1 || scheduleDay > 31)) {
    const error = new Error('Invalid schedule_day');
    error.code = 'WITHDRAW_SETTINGS_SCHEDULE_DAY_INVALID';
    error.statusCode = 400;
    throw error;
  }

  const numericFields = [
    ['fixed_amount', input.fixed_amount],
    ['max_amount_per_run', input.max_amount_per_run],
    ['min_amount_to_trigger', input.min_amount_to_trigger],
    ['min_balance_to_keep', input.min_balance_to_keep],
  ];

  for (const [field, value] of numericFields) {
    if (value !== undefined && value !== null && value !== '') {
      const numeric = normalizeNumeric(value);
      if (numeric === null || numeric < 0) {
        const error = new Error(`Invalid ${field}`);
        error.code = 'WITHDRAW_SETTINGS_AMOUNT_INVALID';
        error.statusCode = 400;
        throw error;
      }
    }
  }

  let defaultDestinationId = null;
  if (input.default_destination_id !== undefined && input.default_destination_id !== null && input.default_destination_id !== '') {
    defaultDestinationId = normalizeInt(input.default_destination_id);
    if (!defaultDestinationId || defaultDestinationId <= 0) {
      const error = new Error('Invalid default_destination_id');
      error.code = 'WITHDRAW_SETTINGS_DEFAULT_DESTINATION_INVALID';
      error.statusCode = 400;
      throw error;
    }

    const destinationResult = await pool.query(
      `
      SELECT id, owner_type, owner_id
      FROM public.withdraw_destinations
      WHERE id = $1
      LIMIT 1
      `,
      [defaultDestinationId]
    );

    const destination = destinationResult.rows[0];
    if (!destination || destination.owner_type !== owner.owner_type || Number(destination.owner_id) !== owner.owner_id) {
      const error = new Error('default destination does not belong to owner');
      error.code = 'WITHDRAW_SETTINGS_DEFAULT_DESTINATION_OWNER_MISMATCH';
      error.statusCode = 400;
      throw error;
    }
  }

  const result = await pool.query(
    `
    INSERT INTO public.withdraw_settings (
      owner_type,
      owner_id,
      mode,
      default_destination_id,
      schedule_enabled,
      schedule_frequency,
      schedule_time,
      schedule_day,
      amount_mode,
      fixed_amount,
      max_amount_per_run,
      min_amount_to_trigger,
      min_balance_to_keep,
      auto_submit_enabled,
      requires_admin_review,
      blocked_reason,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12, $13,
      $14, $15, $16, now(), now()
    )
    ON CONFLICT (owner_type, owner_id)
    DO UPDATE SET
      mode = EXCLUDED.mode,
      default_destination_id = EXCLUDED.default_destination_id,
      schedule_enabled = EXCLUDED.schedule_enabled,
      schedule_frequency = EXCLUDED.schedule_frequency,
      schedule_time = EXCLUDED.schedule_time,
      schedule_day = EXCLUDED.schedule_day,
      amount_mode = EXCLUDED.amount_mode,
      fixed_amount = EXCLUDED.fixed_amount,
      max_amount_per_run = EXCLUDED.max_amount_per_run,
      min_amount_to_trigger = EXCLUDED.min_amount_to_trigger,
      min_balance_to_keep = EXCLUDED.min_balance_to_keep,
      auto_submit_enabled = EXCLUDED.auto_submit_enabled,
      requires_admin_review = EXCLUDED.requires_admin_review,
      blocked_reason = EXCLUDED.blocked_reason,
      updated_at = now()
    RETURNING *
    `,
    [
      owner.owner_type,
      owner.owner_id,
      mode,
      defaultDestinationId,
      normalizeBool(input.schedule_enabled, false),
      scheduleFrequency,
      input.schedule_time ?? null,
      scheduleDay,
      amountMode,
      input.fixed_amount !== undefined && input.fixed_amount !== null && input.fixed_amount !== ''
        ? normalizeNumeric(input.fixed_amount)
        : null,
      input.max_amount_per_run !== undefined && input.max_amount_per_run !== null && input.max_amount_per_run !== ''
        ? normalizeNumeric(input.max_amount_per_run)
        : null,
      input.min_amount_to_trigger !== undefined && input.min_amount_to_trigger !== null && input.min_amount_to_trigger !== ''
        ? normalizeNumeric(input.min_amount_to_trigger)
        : null,
      input.min_balance_to_keep !== undefined && input.min_balance_to_keep !== null && input.min_balance_to_keep !== ''
        ? normalizeNumeric(input.min_balance_to_keep)
        : null,
      normalizeBool(input.auto_submit_enabled, false),
      normalizeBool(input.requires_admin_review, true),
      normalizeText(input.blocked_reason),
    ]
  );

  return result.rows[0] || null;
}

export {
  listDestinationProviders,
  listWithdrawDestinations,
  getWithdrawDestinationById,
  createWithdrawDestination,
  updateWithdrawDestination,
  archiveWithdrawDestination,
  getWithdrawSettings,
  upsertWithdrawSettings,
};
