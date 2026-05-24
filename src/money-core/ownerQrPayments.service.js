'use strict';

import {
  validateOwnerQrDestinationOwnership,
} from './ownerQrDestinations.service.js';

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeInt(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function parsePositiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
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
    is_active: Boolean(row.is_active),
    is_test: row.is_test ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at || null,
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

async function loadBookingForOwnerQrPayment(client, bookingId) {
  const result = await client.query(
    `
SELECT
  b.id,
  b.salon_id,
  b.master_id,
  b.price_snapshot,
  b.status
FROM public.bookings b
WHERE b.id = $1
FOR UPDATE
LIMIT 1
`,
    [bookingId]
  );

  return result.rows[0] || null;
}

async function loadActivePaymentForBooking(client, bookingId) {
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
    [bookingId]
  );

  return result.rows[0] || null;
}

async function loadOwnerQrDestinationById(client, destinationId) {
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

async function createPendingOwnerQrPayment({
  pool,
  bookingId,
  qrDestinationId,
  createdByUserId = null,
}) {
  if (!pool || typeof pool.connect !== 'function') {
    throw createError('OWNER_QR_PAYMENT_INVALID_PAYLOAD', 'Pool is required', 500);
  }

  const normalizedBookingId = normalizeInt(bookingId);
  const normalizedDestinationId = normalizeInt(qrDestinationId);

  if (!normalizedBookingId || !normalizedDestinationId) {
    throw createError('OWNER_QR_PAYMENT_INVALID_PAYLOAD', 'Invalid payload', 400);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const booking = await loadBookingForOwnerQrPayment(client, normalizedBookingId);
    if (!booking) {
      throw createError('OWNER_QR_BOOKING_NOT_FOUND', 'Booking not found', 404);
    }

    const destination = await loadOwnerQrDestinationById(client, normalizedDestinationId);

    if (!destination) {
      throw createError('OWNER_QR_DESTINATION_NOT_FOUND', 'Destination not found', 404);
    }

    if (
      String(destination.destination_type || '') !== 'owner_qr' ||
      !['salon', 'master'].includes(String(destination.owner_type || ''))
    ) {
      throw createError('OWNER_QR_DESTINATION_INVALID_OWNER', 'Invalid destination owner', 403);
    }

    if (
      String(destination.owner_type || '') === 'salon' &&
      Number(destination.owner_id) !== Number(booking.salon_id)
    ) {
      throw createError('OWNER_QR_DESTINATION_BOOKING_MISMATCH', 'Destination owner does not match booking salon', 409);
    }

    if (
      String(destination.owner_type || '') === 'master' &&
      Number(destination.owner_id) !== Number(booking.master_id)
    ) {
      throw createError('OWNER_QR_DESTINATION_BOOKING_MISMATCH', 'Destination owner does not match booking master', 409);
    }

    if (!destination.is_active) {
      throw createError('OWNER_QR_DESTINATION_INACTIVE', 'Destination inactive', 409);
    }

    const amount = parsePositiveAmount(booking.price_snapshot);
    if (!amount) {
      throw createError('OWNER_QR_AMOUNT_SOURCE_NOT_FOUND', 'Amount source not found', 409);
    }

    const activePayment = await loadActivePaymentForBooking(client, normalizedBookingId);
    if (activePayment) {
      const activeProvider = normalizeText(activePayment.provider)?.toLowerCase();
      const activeStatus = normalizeText(activePayment.status)?.toLowerCase();

      if (activeProvider === 'owner_qr') {
        if (activeStatus === 'confirmed') {
          throw createError('OWNER_QR_PAYMENT_ALREADY_CONFIRMED', 'Owner QR payment already confirmed', 409);
        }

        if (activeStatus === 'pending_owner_confirmation' || activeStatus === 'pending') {
          const existingDestination = await validateOwnerQrDestinationOwnership({
            pool: client,
            ownerType: activePayment.collector_owner_type,
            ownerId: activePayment.collector_owner_id,
            destinationId: activePayment.qr_destination_id,
          });

          await client.query('COMMIT');

          return {
            ok: true,
            reused: true,
            payment: normalizePaymentRow(activePayment),
            qr_destination: normalizeDestinationRow(existingDestination),
          };
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

    const paymentRow = insertResult.rows[0] || null;
    return {
      ok: true,
      payment: normalizePaymentRow(paymentRow),
      qr_destination: normalizeDestinationRow(destination),
      created_by_user_id: normalizeInt(createdByUserId),
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
};
