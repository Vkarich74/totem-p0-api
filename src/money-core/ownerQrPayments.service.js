'use strict';

import { assertMoneyCoreWriteAllowed } from './config.js';

const OWNER_QR_SOURCE_TYPE = 'owner_qr_payment';
const OWNER_QR_PLATFORM_OWNER_TYPE = 'system';
const OWNER_QR_PLATFORM_OWNER_ID = 900001;
const OWNER_QR_DESTINATION_TYPE = 'owner_qr';

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

function parsePositiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function isPlainObject(value) {
  return Boolean(value) && value.constructor === Object;
}

function createError(code, message, statusCode = 400) {
  const error = new Error(message || code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeOwner(ownerType, ownerId) {
  const normalizedType = String(ownerType || '').trim();
  const normalizedId = Number(ownerId);

  if (!['salon', 'master'].includes(normalizedType)) {
    throw createError('OWNER_QR_INVALID_OWNER_TYPE', 'Invalid owner type', 400);
  }

  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    throw createError('OWNER_QR_INVALID_OWNER_ID', 'Invalid owner id', 400);
  }

  return { ownerType: normalizedType, ownerId: normalizedId };
}

function normalizePaymentRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    booking_id: row.booking_id,
    amount: row.amount,
    provider: row.provider,
    method: row.method,
    confirmation_mode: row.confirmation_mode,
    status: row.status,
    collector_owner_type: row.collector_owner_type,
    collector_owner_id: row.collector_owner_id,
    qr_destination_id: row.qr_destination_id,
    confirmed_by_user_id: row.confirmed_by_user_id ?? null,
    confirmed_at: row.confirmed_at ?? null,
    rejected_by_user_id: row.rejected_by_user_id ?? null,
    rejected_at: row.rejected_at ?? null,
    rejection_reason: row.rejection_reason ?? null,
    money_core_source_uid: row.money_core_source_uid ?? null,
    money_core_ingested_at: row.money_core_ingested_at ?? null,
    is_active: Boolean(row.is_active),
    is_test: row.is_test ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
    metadata_json: row.metadata_json || {},
  };
}

function normalizeDestinationRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    owner_type: row.owner_type,
    owner_id: row.owner_id,
    destination_type: row.destination_type,
    label: row.label,
    qr_image_url: row.qr_image_url,
    bank_name: row.bank_name,
    account_name: row.account_name,
    phone_or_account: row.phone_or_account,
    is_active: Boolean(row.is_active),
    created_by_user_id: row.created_by_user_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata_json: row.metadata_json || {},
  };
}

function normalizeOwnerQrOptionsDestinationRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    owner_type: row.owner_type,
    owner_id: row.owner_id,
    destination_type: row.destination_type,
    label: row.label,
    qr_image_url: row.qr_image_url,
    bank_name: row.bank_name,
    account_name: row.account_name,
    phone_or_account: row.phone_or_account,
  };
}

function normalizeOwnerQrPaymentReadRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    booking_id: row.booking_id ?? null,
    amount: row.amount,
    provider: row.provider,
    method: row.method,
    confirmation_mode: row.confirmation_mode,
    status: row.status,
    collector_owner_type: row.collector_owner_type,
    collector_owner_id: row.collector_owner_id,
    qr_destination_id: row.qr_destination_id,
    confirmed_at: row.confirmed_at ?? null,
    rejected_at: row.rejected_at ?? null,
    rejection_reason: row.rejection_reason ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
    client_name: row.client_name ?? null,
    client_phone: row.client_phone ?? null,
    salon_id: row.salon_id ?? null,
    master_id: row.master_id ?? null,
    service_id: row.service_id ?? null,
    booking_status: row.booking_status ?? null,
    booking_start_at: row.booking_start_at ?? null,
    booking_end_at: row.booking_end_at ?? null,
    salon_name: row.salon_name ?? null,
    master_name: row.master_name ?? null,
    service_name: row.service_name ?? null,
  };
}

async function getOwnerQrPaymentOptions({ pool, bookingId }) {
  if (!pool || typeof pool.query !== 'function') {
    throw createError('OWNER_QR_PAYMENT_INVALID_PAYLOAD', 'Pool is required', 500);
  }

  const normalizedBookingId = normalizePositiveInt(bookingId);
  if (!normalizedBookingId) {
    throw createError('OWNER_QR_PAYMENT_INVALID_PAYLOAD', 'Booking id is required', 400);
  }

  const bookingResult = await pool.query(
    `
    SELECT
      b.id,
      b.salon_id,
      b.master_id
    FROM public.bookings b
    WHERE b.id = $1
    LIMIT 1
    `,
    [normalizedBookingId]
  );

  const booking = bookingResult.rows[0] || null;
  if (!booking) {
    throw createError('OWNER_QR_BOOKING_NOT_FOUND', 'Booking not found', 404);
  }

  const destinationsResult = await pool.query(
    `
    SELECT *
    FROM public.owner_payment_destinations
    WHERE destination_type = $1
      AND is_active = true
      AND (
        (owner_type = 'salon' AND owner_id = $2)
        OR (owner_type = 'master' AND owner_id = $3)
      )
    ORDER BY owner_type ASC, created_at DESC, id DESC
    `,
    [OWNER_QR_DESTINATION_TYPE, booking.salon_id, booking.master_id]
  );

  return {
    booking_id: booking.id,
    destinations: destinationsResult.rows.map(normalizeOwnerQrOptionsDestinationRow),
  };
}

async function listOwnerQrPaymentsForOwner({ pool, ownerType, ownerId }) {
  const owner = normalizeOwner(ownerType, ownerId);

  const result = await pool.query(
    `
    SELECT
      p.id,
      p.booking_id,
      p.amount,
      p.provider,
      p.method,
      p.confirmation_mode,
      p.status,
      p.collector_owner_type,
      p.collector_owner_id,
      p.qr_destination_id,
      p.confirmed_at,
      p.rejected_at,
      p.rejection_reason,
      p.created_at,
      p.updated_at,
      b.status AS booking_status,
      b.salon_id,
      b.master_id,
      b.service_id,
      b.start_at AS booking_start_at,
      b.end_at AS booking_end_at,
      c.name AS client_name,
      c.phone AS client_phone,
      s.name AS service_name,
      sal.name AS salon_name,
      m.name AS master_name
    FROM public.payments p
    LEFT JOIN public.bookings b ON b.id = p.booking_id
    LEFT JOIN public.clients c ON c.id = b.client_id
    LEFT JOIN public.services s ON s.id = b.service_id
    LEFT JOIN public.salons sal ON sal.id = b.salon_id
    LEFT JOIN public.masters m ON m.id = b.master_id
    WHERE p.collector_owner_type = $1
      AND p.collector_owner_id = $2
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT 200
    `,
    [owner.ownerType, owner.ownerId]
  );

  return result.rows.map(normalizeOwnerQrPaymentReadRow);
}

function normalizeObligationRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    source_type: row.source_type,
    source_id: row.source_id,
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
    settled_at: row.settled_at ?? null,
    cancelled_at: row.cancelled_at ?? null,
    metadata_json: row.metadata_json || {},
  };
}

function normalizePayloadMetadata(destination) {
  const metadata = {
    source: 'owner_qr_pending',
  };

  const destinationLabel = normalizeText(destination?.label);
  if (destinationLabel) {
    metadata.destination_label = destinationLabel;
  }

  return metadata;
}

function normalizeActorContext(actorContext = {}) {
  return {
    auth: actorContext.auth || null,
    identity: actorContext.identity || null,
    user_id: normalizePositiveInt(actorContext.userId)
      || normalizePositiveInt(actorContext.user_id)
      || normalizePositiveInt(actorContext.auth?.user_id)
      || normalizePositiveInt(actorContext.auth?.id)
      || normalizePositiveInt(actorContext.identity?.user_id)
      || null,
  };
}

function actorHasOwnership(actorContext, ownerType, ownerId) {
  const ownership = [
    ...(Array.isArray(actorContext?.identity?.ownership) ? actorContext.identity.ownership : []),
    ...(Array.isArray(actorContext?.auth?.ownership) ? actorContext.auth.ownership : []),
  ];

  const resolvedOwnerType = normalizeText(ownerType);
  const resolvedOwnerId = normalizePositiveInt(ownerId);

  if (!resolvedOwnerType || !resolvedOwnerId) {
    return false;
  }

  return ownership.some((item) => {
    if (!item) {
      return false;
    }

    return (
      String(item.owner_type || '').trim() === resolvedOwnerType
      && normalizePositiveInt(item.owner_id) === resolvedOwnerId
    );
  });
}

function actorCanManageOwnerQrPayment(actorContext, payment, booking) {
  if (actorHasOwnership(actorContext, payment.collector_owner_type, payment.collector_owner_id)) {
    return true;
  }

  const resolvedOwnerType = normalizeText(payment.collector_owner_type);
  const actorOwnerType = normalizeText(actorContext?.auth?.owner_type);
  const actorOwnerSlug = normalizeText(
    actorContext?.auth?.owner_slug
      || actorContext?.auth?.salon_slug
      || actorContext?.auth?.master_slug
  );

  if (!resolvedOwnerType || !actorOwnerType || !actorOwnerSlug) {
    return false;
  }

  if (resolvedOwnerType === 'salon') {
    return actorOwnerType === 'salon' && actorOwnerSlug === normalizeText(booking?.salon_slug);
  }

  if (resolvedOwnerType === 'master') {
    return actorOwnerType === 'master' && actorOwnerSlug === normalizeText(booking?.master_slug);
  }

  return false;
}

function assertConfirmWriteAllowed() {
  try {
    assertMoneyCoreWriteAllowed();
  } catch (error) {
    throw createError('OWNER_QR_CONFIRM_WRITE_DISABLED', error?.message || 'Money Core write disabled', 409);
  }
}

async function loadPaymentForUpdate(client, paymentId) {
  const result = await client.query(
    `
SELECT
  id,
  booking_id,
  amount,
  provider,
  method,
  confirmation_mode,
  status,
  collector_owner_type,
  collector_owner_id,
  qr_destination_id,
  confirmed_by_user_id,
  confirmed_at,
  rejected_by_user_id,
  rejected_at,
  rejection_reason,
  money_core_source_uid,
  money_core_ingested_at,
  is_active,
  is_test,
  created_at,
  updated_at,
  metadata_json
FROM public.payments
WHERE id = $1
FOR UPDATE
LIMIT 1
`,
    [paymentId]
  );

  return result.rows[0] || null;
}

async function loadBookingForUpdate(client, bookingId) {
  const result = await client.query(
    `
SELECT
  b.id,
  b.salon_id,
  b.master_id,
  b.price_snapshot,
  b.status,
  sal.slug AS salon_slug,
  m.slug AS master_slug
FROM public.bookings b
LEFT JOIN public.salons sal ON sal.id = b.salon_id
LEFT JOIN public.masters m ON m.id = b.master_id
WHERE b.id = $1
FOR UPDATE
LIMIT 1
`,
    [bookingId]
  );

  return result.rows[0] || null;
}

async function loadDestinationForUpdate(client, destinationId) {
  const result = await client.query(
    `
SELECT *
FROM public.owner_payment_destinations
WHERE id = $1
FOR UPDATE
LIMIT 1
`,
    [destinationId]
  );

  return result.rows[0] || null;
}

async function loadActiveContractForBooking(client, booking) {
  const result = await client.query(
    `
SELECT
  id,
  salon_id,
  master_id,
  status,
  terms_json,
  effective_from,
  created_at
FROM public.contracts
WHERE salon_id = $1
  AND master_id = $2
  AND status = 'active'
ORDER BY effective_from DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
LIMIT 1
`,
    [String(booking.salon_id), String(booking.master_id)]
  );

  return result.rows[0] || null;
}

function validateContractTerms(terms) {
  if (!isPlainObject(terms)) {
    throw createError('OWNER_QR_INVALID_CONTRACT_TERMS', 'Invalid contract terms', 409);
  }

  const masterPercent = Number(terms.master_percent);
  const salonPercent = Number(terms.salon_percent);
  const platformPercent = Number(terms.platform_percent);

  if (
    !Number.isFinite(masterPercent)
    || !Number.isFinite(salonPercent)
    || !Number.isFinite(platformPercent)
    || masterPercent < 0
    || salonPercent < 0
    || platformPercent < 0
  ) {
    throw createError('OWNER_QR_INVALID_CONTRACT_TERMS', 'Invalid contract terms', 409);
  }

  if (masterPercent + salonPercent + platformPercent !== 100) {
    throw createError('OWNER_QR_INVALID_CONTRACT_TERMS', 'Invalid contract terms', 409);
  }

  return {
    master_percent: masterPercent,
    salon_percent: salonPercent,
    platform_percent: platformPercent,
  };
}

function calculateOwnerQrAmounts(totalAmount, terms) {
  const normalizedTotal = roundMoney(totalAmount);
  const masterAmount = roundMoney(normalizedTotal * terms.master_percent / 100);
  const salonAmount = roundMoney(normalizedTotal * terms.salon_percent / 100);
  const platformAmount = roundMoney(normalizedTotal - masterAmount - salonAmount);

  return {
    master_amount: masterAmount,
    salon_amount: salonAmount,
    platform_amount: platformAmount,
  };
}

function buildOwnerQrObligations({
  payment,
  booking,
  amounts,
}) {
  const paymentId = Number(payment.id);
  const bookingId = Number(payment.booking_id || booking.id);
  const collectorType = String(payment.collector_owner_type || '').trim();
  const collectorId = normalizePositiveInt(payment.collector_owner_id);

  const obligations = [];

  if (collectorType === 'salon') {
    if (amounts.master_amount > 0) {
      obligations.push({
        source_type: OWNER_QR_SOURCE_TYPE,
        source_id: paymentId,
        payment_id: paymentId,
        booking_id: bookingId,
        from_owner_type: 'salon',
        from_owner_id: normalizePositiveInt(collectorId),
        to_owner_type: 'master',
        to_owner_id: normalizePositiveInt(booking.master_id),
        amount: amounts.master_amount,
        currency: 'KGS',
        status: 'open',
        obligation_type: 'owner_qr_split_due',
        split_role: 'master',
        metadata_json: {
          source: OWNER_QR_SOURCE_TYPE,
        },
      });
    }

    if (amounts.platform_amount > 0) {
      obligations.push({
        source_type: OWNER_QR_SOURCE_TYPE,
        source_id: paymentId,
        payment_id: paymentId,
        booking_id: bookingId,
        from_owner_type: 'salon',
        from_owner_id: normalizePositiveInt(collectorId),
        to_owner_type: OWNER_QR_PLATFORM_OWNER_TYPE,
        to_owner_id: OWNER_QR_PLATFORM_OWNER_ID,
        amount: amounts.platform_amount,
        currency: 'KGS',
        status: 'open',
        obligation_type: 'platform_fee_due',
        split_role: 'platform',
        metadata_json: {
          source: OWNER_QR_SOURCE_TYPE,
        },
      });
    }
  } else if (collectorType === 'master') {
    if (amounts.salon_amount > 0) {
      obligations.push({
        source_type: OWNER_QR_SOURCE_TYPE,
        source_id: paymentId,
        payment_id: paymentId,
        booking_id: bookingId,
        from_owner_type: 'master',
        from_owner_id: normalizePositiveInt(collectorId),
        to_owner_type: 'salon',
        to_owner_id: normalizePositiveInt(booking.salon_id),
        amount: amounts.salon_amount,
        currency: 'KGS',
        status: 'open',
        obligation_type: 'owner_qr_split_due',
        split_role: 'salon',
        metadata_json: {
          source: OWNER_QR_SOURCE_TYPE,
        },
      });
    }

    if (amounts.platform_amount > 0) {
      obligations.push({
        source_type: OWNER_QR_SOURCE_TYPE,
        source_id: paymentId,
        payment_id: paymentId,
        booking_id: bookingId,
        from_owner_type: 'master',
        from_owner_id: normalizePositiveInt(collectorId),
        to_owner_type: OWNER_QR_PLATFORM_OWNER_TYPE,
        to_owner_id: OWNER_QR_PLATFORM_OWNER_ID,
        amount: amounts.platform_amount,
        currency: 'KGS',
        status: 'open',
        obligation_type: 'platform_fee_due',
        split_role: 'platform',
        metadata_json: {
          source: OWNER_QR_SOURCE_TYPE,
        },
      });
    }
  }

  return obligations;
}

async function loadObligationsByPayment(client, paymentId) {
  const result = await client.query(
    `
SELECT *
FROM public.money_owner_obligations
WHERE source_type = $1
  AND source_id = $2
ORDER BY id ASC
`,
    [OWNER_QR_SOURCE_TYPE, Number(paymentId)]
  );

  return result.rows.map(normalizeObligationRow);
}

async function insertObligations(client, obligations = []) {
  for (const obligation of obligations) {
    await client.query(
      `
INSERT INTO public.money_owner_obligations (
  source_type,
  source_id,
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
  metadata_json
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb
)
ON CONFLICT (
  source_type,
  source_id,
  from_owner_type,
  from_owner_id,
  to_owner_type,
  to_owner_id,
  obligation_type,
  COALESCE(split_role, ''::text)
) DO NOTHING
`,
      [
        obligation.source_type,
        obligation.source_id,
        obligation.payment_id,
        obligation.booking_id,
        obligation.from_owner_type,
        obligation.from_owner_id,
        obligation.to_owner_type,
        obligation.to_owner_id,
        obligation.amount,
        obligation.currency,
        obligation.status,
        obligation.obligation_type,
        obligation.split_role,
        JSON.stringify(obligation.metadata_json || {}),
      ]
    );
  }
}

async function createPendingOwnerQrPayment({
  pool,
  bookingId,
  qrDestinationId,
  createdByUserId = null,
}) {
  if (!pool || typeof pool.connect !== 'function') {
    throw createError('OWNER_QR_PAYMENT_INVALID_PAYLOAD', 'Pool is required', 500);
  }

  const normalizedBookingId = normalizePositiveInt(bookingId);
  const normalizedDestinationId = normalizePositiveInt(qrDestinationId);

  if (!normalizedBookingId || !normalizedDestinationId) {
    throw createError('OWNER_QR_PAYMENT_INVALID_PAYLOAD', 'Invalid payload', 400);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const booking = await loadBookingForUpdate(client, normalizedBookingId);
    if (!booking) {
      throw createError('OWNER_QR_BOOKING_NOT_FOUND', 'Booking not found', 404);
    }

    const destination = await loadDestinationForUpdate(client, normalizedDestinationId);
    if (!destination) {
      throw createError('OWNER_QR_DESTINATION_NOT_FOUND', 'Destination not found', 404);
    }

    if (String(destination.destination_type || '') !== OWNER_QR_DESTINATION_TYPE) {
      throw createError('OWNER_QR_DESTINATION_NOT_FOUND', 'Destination not found', 404);
    }

    if (!Boolean(destination.is_active)) {
      throw createError('OWNER_QR_DESTINATION_INACTIVE', 'Destination inactive', 409);
    }

    if (
      String(destination.owner_type || '') !== String(destination.owner_type || '').trim()
      || !['salon', 'master'].includes(String(destination.owner_type || '').trim())
    ) {
      throw createError('OWNER_QR_DESTINATION_NOT_FOUND', 'Destination not found', 404);
    }

    if (String(destination.owner_type) === 'salon') {
      if (normalizePositiveInt(destination.owner_id) !== normalizePositiveInt(booking.salon_id)) {
        throw createError('OWNER_QR_DESTINATION_BOOKING_MISMATCH', 'Destination owner mismatch', 409);
      }
    } else if (String(destination.owner_type) === 'master') {
      if (normalizePositiveInt(destination.owner_id) !== normalizePositiveInt(booking.master_id)) {
        throw createError('OWNER_QR_DESTINATION_BOOKING_MISMATCH', 'Destination owner mismatch', 409);
      }
    } else {
      throw createError('OWNER_QR_DESTINATION_NOT_FOUND', 'Destination not found', 404);
    }

    const amount = parsePositiveAmount(booking.price_snapshot);
    if (!amount) {
      throw createError('OWNER_QR_PAYMENT_INVALID_STATUS', 'Payment amount is invalid', 409);
    }

    const activePaymentResult = await client.query(
      `
SELECT
  id,
  booking_id,
  amount,
  provider,
  method,
  confirmation_mode,
  status,
  collector_owner_type,
  collector_owner_id,
  qr_destination_id,
  confirmed_by_user_id,
  confirmed_at,
  rejected_by_user_id,
  rejected_at,
  rejection_reason,
  money_core_source_uid,
  money_core_ingested_at,
  is_active,
  is_test,
  created_at,
  updated_at,
  metadata_json
FROM public.payments
WHERE booking_id = $1
  AND is_active = true
ORDER BY updated_at DESC NULLS LAST, id DESC
FOR UPDATE
LIMIT 1
`,
      [normalizedBookingId]
    );

    if (activePaymentResult.rows.length) {
      const activePayment = normalizePaymentRow(activePaymentResult.rows[0]);
      const activeStatus = normalizeText(activePayment.status)?.toLowerCase();
      const activeProvider = normalizeText(activePayment.provider)?.toLowerCase();

      if (activeProvider === 'owner_qr') {
        if (activeStatus === 'confirmed') {
          throw createError('OWNER_QR_PAYMENT_ALREADY_CONFIRMED', 'Owner QR payment already confirmed', 409);
        }

        if (activeStatus === 'pending_owner_confirmation' || activeStatus === 'pending') {
          await client.query('COMMIT');

          return {
            ok: true,
            reused: true,
            idempotent: true,
            payment: activePayment,
            qr_destination: normalizeDestinationRow(destination),
          };
        }

        if (activeStatus === 'rejected') {
          throw createError('OWNER_QR_PAYMENT_ALREADY_REJECTED', 'Owner QR payment already rejected', 409);
        }
      }

      throw createError('ACTIVE_PAYMENT_EXISTS', 'Active payment already exists', 409);
    }

    const insertResult = await client.query(
      `
INSERT INTO public.payments (
  booking_id,
  amount,
  provider,
  method,
  confirmation_mode,
  status,
  collector_owner_type,
  collector_owner_id,
  qr_destination_id,
  is_active,
  metadata_json
) VALUES (
  $1,
  $2,
  'owner_qr',
  'owner_qr',
  'manual_owner_confirm',
  'pending_owner_confirmation',
  $3,
  $4,
  $5,
  true,
  $6::jsonb
)
RETURNING
  id,
  booking_id,
  amount,
  provider,
  method,
  confirmation_mode,
  status,
  collector_owner_type,
  collector_owner_id,
  qr_destination_id,
  confirmed_by_user_id,
  confirmed_at,
  rejected_by_user_id,
  rejected_at,
  rejection_reason,
  money_core_source_uid,
  money_core_ingested_at,
  is_active,
  is_test,
  created_at,
  updated_at,
  metadata_json
`,
      [
        normalizedBookingId,
        amount,
        destination.owner_type,
        destination.owner_id,
        destination.id,
        JSON.stringify(normalizePayloadMetadata(destination)),
      ]
    );

    await client.query('COMMIT');

    return {
      ok: true,
      payment: normalizePaymentRow(insertResult.rows[0]),
      qr_destination: normalizeDestinationRow(destination),
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

async function confirmOwnerQrPayment({
  pool,
  paymentId,
  actorUserId = null,
  actorContext = {},
}) {
  if (!pool || typeof pool.connect !== 'function') {
    throw createError('OWNER_QR_PAYMENT_NOT_FOUND', 'Pool is required', 500);
  }

  const normalizedPaymentId = normalizePositiveInt(paymentId);
  if (!normalizedPaymentId) {
    throw createError('OWNER_QR_PAYMENT_NOT_FOUND', 'Payment not found', 404);
  }

  const actor = normalizeActorContext({
    ...actorContext,
    userId: actorUserId,
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const paymentRow = await loadPaymentForUpdate(client, normalizedPaymentId);
    if (!paymentRow) {
      throw createError('OWNER_QR_PAYMENT_NOT_FOUND', 'Payment not found', 404);
    }

    const payment = normalizePaymentRow(paymentRow);
    const normalizedProvider = normalizeText(payment.provider)?.toLowerCase();
    const normalizedMethod = normalizeText(payment.method)?.toLowerCase();
    const normalizedStatus = normalizeText(payment.status)?.toLowerCase();
    const expectedSourceUid = `owner_qr:payment:${payment.id}`;

    if (normalizedStatus === 'confirmed') {
      if (normalizeText(payment.money_core_source_uid) === expectedSourceUid) {
        const obligations = await loadObligationsByPayment(client, payment.id);
        await client.query('COMMIT');

        return {
          ok: true,
          reused: true,
          idempotent: true,
          payment,
          obligations,
        };
      }

      throw createError('OWNER_QR_PAYMENT_ALREADY_CONFIRMED', 'Owner QR payment already confirmed', 409);
    }

    if (normalizedStatus === 'rejected') {
      throw createError('OWNER_QR_PAYMENT_ALREADY_REJECTED', 'Owner QR payment already rejected', 409);
    }

    if (normalizedStatus !== 'pending_owner_confirmation') {
      throw createError('OWNER_QR_PAYMENT_INVALID_STATUS', 'Payment status is invalid', 409);
    }

    assertConfirmWriteAllowed();

    if (!payment.qr_destination_id) {
      throw createError('OWNER_QR_DESTINATION_NOT_FOUND', 'Destination not found', 404);
    }

    const booking = await loadBookingForUpdate(client, payment.booking_id);
    if (!booking) {
      throw createError('OWNER_QR_PAYMENT_NOT_FOUND', 'Booking not found', 404);
    }

    if (normalizedProvider !== OWNER_QR_DESTINATION_TYPE && normalizedMethod !== OWNER_QR_DESTINATION_TYPE) {
      throw createError('OWNER_QR_PAYMENT_NOT_OWNER_QR', 'Payment is not owner_qr', 409);
    }

    if (!actorCanManageOwnerQrPayment(actor, payment, booking)) {
      throw createError('OWNER_QR_FORBIDDEN', 'Forbidden', 403);
    }

    const destination = await loadDestinationForUpdate(client, payment.qr_destination_id);
    if (!destination) {
      throw createError('OWNER_QR_DESTINATION_NOT_FOUND', 'Destination not found', 404);
    }

    if (String(destination.destination_type || '') !== OWNER_QR_DESTINATION_TYPE) {
      throw createError('OWNER_QR_DESTINATION_NOT_FOUND', 'Destination not found', 404);
    }

    if (!Boolean(destination.is_active)) {
      throw createError('OWNER_QR_DESTINATION_INACTIVE', 'Destination inactive', 409);
    }

    if (
      String(destination.owner_type || '') !== String(payment.collector_owner_type || '')
      || normalizePositiveInt(destination.owner_id) !== normalizePositiveInt(payment.collector_owner_id)
    ) {
      throw createError('OWNER_QR_DESTINATION_BOOKING_MISMATCH', 'Destination owner mismatch', 409);
    }

    if (
      String(payment.collector_owner_type || '') === 'salon'
      && normalizePositiveInt(destination.owner_id) !== normalizePositiveInt(booking.salon_id)
    ) {
      throw createError('OWNER_QR_DESTINATION_BOOKING_MISMATCH', 'Destination owner mismatch', 409);
    }

    if (
      String(payment.collector_owner_type || '') === 'master'
      && normalizePositiveInt(destination.owner_id) !== normalizePositiveInt(booking.master_id)
    ) {
      throw createError('OWNER_QR_DESTINATION_BOOKING_MISMATCH', 'Destination owner mismatch', 409);
    }

    if (!actorCanManageOwnerQrPayment(actor, payment, booking)) {
      throw createError('OWNER_QR_FORBIDDEN', 'Forbidden', 403);
    }

    const contract = await loadActiveContractForBooking(client, booking);
    if (!contract) {
      throw createError('OWNER_QR_ACTIVE_CONTRACT_REQUIRED', 'Active contract required', 409);
    }

    const terms = validateContractTerms(contract.terms_json);
    const amounts = calculateOwnerQrAmounts(payment.amount, terms);
    const obligationsInput = buildOwnerQrObligations({
      payment,
      booking,
      destination,
      amounts,
    });

    await insertObligations(client, obligationsInput);

    const updatedPaymentResult = await client.query(
      `
UPDATE public.payments
SET
  status = 'confirmed',
  confirmed_by_user_id = $2,
  confirmed_at = now(),
  money_core_source_uid = $3,
  money_core_ingested_at = now(),
  updated_at = now()
WHERE id = $1
  AND status = 'pending_owner_confirmation'
  AND method = 'owner_qr'
RETURNING
  id,
  booking_id,
  amount,
  provider,
  method,
  confirmation_mode,
  status,
  collector_owner_type,
  collector_owner_id,
  qr_destination_id,
  confirmed_by_user_id,
  confirmed_at,
  rejected_by_user_id,
  rejected_at,
  rejection_reason,
  money_core_source_uid,
  money_core_ingested_at,
  is_active,
  is_test,
  created_at,
  updated_at,
  metadata_json
`,
      [
        payment.id,
        actor.user_id,
        expectedSourceUid,
      ]
    );

    if (!updatedPaymentResult.rows.length) {
      throw createError('OWNER_QR_PAYMENT_INVALID_STATUS', 'Payment status is invalid', 409);
    }

    const confirmedPayment = normalizePaymentRow(updatedPaymentResult.rows[0]);
    const obligations = await loadObligationsByPayment(client, payment.id);

    await client.query('COMMIT');

    return {
      ok: true,
      payment: confirmedPayment,
      obligations,
      split: amounts,
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

async function rejectOwnerQrPayment({
  pool,
  paymentId,
  actorUserId = null,
  actorContext = {},
  rejectionReason = null,
}) {
  if (!pool || typeof pool.connect !== 'function') {
    throw createError('OWNER_QR_PAYMENT_NOT_FOUND', 'Pool is required', 500);
  }

  const normalizedPaymentId = normalizePositiveInt(paymentId);
  if (!normalizedPaymentId) {
    throw createError('OWNER_QR_PAYMENT_NOT_FOUND', 'Payment not found', 404);
  }

  const reason = normalizeText(rejectionReason);
  const actor = normalizeActorContext({
    ...actorContext,
    userId: actorUserId,
  });

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const paymentRow = await loadPaymentForUpdate(client, normalizedPaymentId);
    if (!paymentRow) {
      throw createError('OWNER_QR_PAYMENT_NOT_FOUND', 'Payment not found', 404);
    }

    const payment = normalizePaymentRow(paymentRow);
    const normalizedProvider = normalizeText(payment.provider)?.toLowerCase();
    const normalizedMethod = normalizeText(payment.method)?.toLowerCase();
    const normalizedStatus = normalizeText(payment.status)?.toLowerCase();

    if (normalizedProvider !== OWNER_QR_DESTINATION_TYPE && normalizedMethod !== OWNER_QR_DESTINATION_TYPE) {
      throw createError('OWNER_QR_PAYMENT_NOT_OWNER_QR', 'Payment is not owner_qr', 409);
    }

    if (!actorCanManageOwnerQrPayment(actor, payment, booking)) {
      throw createError('OWNER_QR_FORBIDDEN', 'Forbidden', 403);
    }

    if (normalizedStatus === 'confirmed') {
      throw createError('OWNER_QR_PAYMENT_ALREADY_CONFIRMED', 'Owner QR payment already confirmed', 409);
    }

    if (normalizedStatus === 'rejected') {
      await client.query('COMMIT');
      return {
        ok: true,
        reused: true,
        idempotent: true,
        payment,
        obligations: [],
      };
    }

    if (normalizedStatus !== 'pending_owner_confirmation') {
      throw createError('OWNER_QR_PAYMENT_INVALID_STATUS', 'Payment status is invalid', 409);
    }

    if (!reason) {
      throw createError('OWNER_QR_REJECTION_REASON_REQUIRED', 'Rejection reason is required', 400);
    }

    const updatedPaymentResult = await client.query(
      `
UPDATE public.payments
SET
  status = 'rejected',
  rejected_by_user_id = $2,
  rejected_at = now(),
  rejection_reason = $3,
  updated_at = now()
WHERE id = $1
  AND status = 'pending_owner_confirmation'
  AND method = 'owner_qr'
RETURNING
  id,
  booking_id,
  amount,
  provider,
  method,
  confirmation_mode,
  status,
  collector_owner_type,
  collector_owner_id,
  qr_destination_id,
  confirmed_by_user_id,
  confirmed_at,
  rejected_by_user_id,
  rejected_at,
  rejection_reason,
  money_core_source_uid,
  money_core_ingested_at,
  is_active,
  is_test,
  created_at,
  updated_at,
  metadata_json
`,
      [
        payment.id,
        actor.user_id,
        reason,
      ]
    );

    if (!updatedPaymentResult.rows.length) {
      throw createError('OWNER_QR_PAYMENT_INVALID_STATUS', 'Payment status is invalid', 409);
    }

    await client.query('COMMIT');

    return {
      ok: true,
      payment: normalizePaymentRow(updatedPaymentResult.rows[0]),
      obligations: [],
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
  createPendingOwnerQrPayment,
  confirmOwnerQrPayment,
  rejectOwnerQrPayment,
  getOwnerQrPaymentOptions,
  listOwnerQrPaymentsForOwner,
};
