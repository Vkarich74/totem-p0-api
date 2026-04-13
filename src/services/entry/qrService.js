// C:\Work\totem-p0-api\src\services\entry\qrService.js

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

export function assertQrTargetAllowed(url) {
  const normalizedUrl = String(url || '').trim();

  if (!normalizedUrl) {
    throw new Error('QR_SERVICE_ERROR: qr target url required');
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
  const result = buildQrPayload(input);

  assertQrTargetAllowed(result.qr.qr_target_url);

  return result;
}

export default {
  buildQrPayload,
  buildQrContract,
  assertQrTargetAllowed
};