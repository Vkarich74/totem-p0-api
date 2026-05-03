// C:\Work\totem-p0-api\src\services\entry\qrService.js

import { resolveCanonicalBookingAppBaseUrl } from './entryContract.js';

const WEB_BASE = (process.env.WEB_BASE || 'https://www.totemv.com').replace(/\/+$/, '');

function normalizeOwnerType(value) {
  const ownerType = String(value || '').trim().toLowerCase();

  if (!ownerType) {
    throw new Error('QR_SERVICE_ERROR: owner_type required');
  }

  if (ownerType !== 'salon' && ownerType !== 'master') {
    throw new Error('QR_SERVICE_ERROR: owner_type must be salon or master');
  }

  return ownerType;
}

function normalizeSlug(value) {
  const slug = String(value || '').trim();

  if (!slug) {
    throw new Error('QR_SERVICE_ERROR: canonical_slug required');
  }

  return slug;
}

function buildPublicUrl({ ownerType, canonicalSlug }) {
  return `${WEB_BASE}/${ownerType}/${canonicalSlug}`;
}

function normalizeTargetType(value) {
  const targetType = String(value || '').trim().toLowerCase();

  if (targetType === 'booking_entry') {
    return 'booking_entry';
  }

  return 'public_page';
}

function normalizeBookingTargetUrl(url) {
  const normalizedUrl = String(url || '').trim();

  if (!normalizedUrl) {
    throw new Error('QR_SERVICE_ERROR: booking qr target url required');
  }

  const appBase = resolveCanonicalBookingAppBaseUrl();
  const forbiddenFragments = [
    'token=',
    'client_token=',
    '/#/client',
    '/#/auth',
    '/#/salon',
    '/#/master'
  ];

  if (!normalizedUrl.startsWith(appBase)) {
    throw new Error('QR_SERVICE_ERROR: booking qr target must use app base');
  }

  if (!normalizedUrl.includes('/#/booking?')) {
    throw new Error('QR_SERVICE_ERROR: booking qr target must point to booking');
  }

  if (forbiddenFragments.some((fragment) => normalizedUrl.includes(fragment))) {
    throw new Error('QR_SERVICE_ERROR: forbidden booking qr target');
  }

  return normalizedUrl.replace(/\/+$/, '');
}

/**
 * QR SERVICE v1
 *
 * Контракт:
 * - QR только для public personal page
 * - cabinet links запрещены как QR target
 * - сервис не генерирует image/png сам
 * - сервис отдаёт стабильный payload/contract для следующего route/provider слоя
 */
export function buildQrPayload(input = {}) {
  const ownerType = normalizeOwnerType(input.owner_type);
  const canonicalSlug = normalizeSlug(input.canonical_slug);
  const publicUrl = buildPublicUrl({
    ownerType,
    canonicalSlug
  });

  return {
    ok: true,
    qr: {
      owner_type: ownerType,
      owner_id: input.owner_id ?? null,
      canonical_slug: canonicalSlug,

      qr_scope: 'public_only',
      qr_target_type: 'public_page',
      qr_target_url: publicUrl,
      public_url: publicUrl,

      entry_version: 'v1',
      generated_at: new Date().toISOString()
    }
  };
}

export function buildBookingQrPayload(input = {}) {
  const ownerType = input.owner_type ? normalizeOwnerType(input.owner_type) : null;
  const canonicalSlug = input.canonical_slug ? normalizeSlug(input.canonical_slug) : null;
  const bookingUrl = normalizeBookingTargetUrl(input.qr_target_url || input.booking_url);

  return {
    ok: true,
    qr: {
      owner_type: ownerType,
      owner_id: input.owner_id ?? null,
      canonical_slug: canonicalSlug,

      qr_scope: 'booking_only',
      qr_target_type: 'booking_entry',
      qr_target_url: bookingUrl,
      booking_url: bookingUrl,

      ...(input.salon_slug ? { salon_slug: input.salon_slug } : {}),
      ...(typeof input.master_id !== 'undefined' ? { master_id: input.master_id } : {}),
      ...(typeof input.active_service_links !== 'undefined' ? { active_service_links: input.active_service_links } : {}),

      entry_version: 'v1',
      generated_at: new Date().toISOString()
    }
  };
}

export function assertQrTargetAllowed(url, targetType = 'public_page') {
  const normalizedUrl = String(url || '').trim();
  const normalizedTargetType = normalizeTargetType(targetType);

  if (!normalizedUrl) {
    throw new Error('QR_SERVICE_ERROR: qr target url required');
  }

  if (normalizedTargetType === 'booking_entry') {
    const appBase = resolveCanonicalBookingAppBaseUrl();
    const forbiddenFragments = [
      'token=',
      'client_token=',
      '/#/client',
      '/#/auth',
      '/#/salon',
      '/#/master'
    ];

    if (!normalizedUrl.startsWith(appBase)) {
      throw new Error('QR_SERVICE_ERROR: booking qr target must use app base');
    }

    if (!normalizedUrl.includes('/#/booking?')) {
      throw new Error('QR_SERVICE_ERROR: booking qr target must point to booking');
    }

    if (forbiddenFragments.some((fragment) => normalizedUrl.includes(fragment))) {
      throw new Error('QR_SERVICE_ERROR: forbidden booking qr target');
    }

    return true;
  }

  if (normalizedUrl.includes('/#/')) {
    throw new Error('QR_SERVICE_ERROR: cabinet url is forbidden for qr');
  }

  if (!normalizedUrl.startsWith(WEB_BASE)) {
    throw new Error('QR_SERVICE_ERROR: qr target must use WEB_BASE');
  }

  return true;
}

export function buildQrContract(input = {}) {
  const targetType = normalizeTargetType(input.qr_target_type);
  const result = targetType === 'booking_entry'
    ? buildBookingQrPayload(input)
    : buildQrPayload(input);

  assertQrTargetAllowed(result.qr.qr_target_url, result.qr.qr_target_type);

  return result;
}

export default {
  buildQrPayload,
  buildBookingQrPayload,
  buildQrContract,
  assertQrTargetAllowed
};
