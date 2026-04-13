// C:\Work\totem-p0-api\src\services\entry\entryBuilder.js

const WEB_BASE = (process.env.WEB_BASE || 'https://www.totemv.com').replace(/\/+$/, '');

function normalizeOwnerType(value) {
  const ownerType = String(value || '').trim().toLowerCase();

  if (!ownerType) {
    throw new Error('ENTRY_BUILDER_ERROR: owner_type required');
  }

  if (ownerType !== 'salon' && ownerType !== 'master') {
    throw new Error('ENTRY_BUILDER_ERROR: owner_type must be salon or master');
  }

  return ownerType;
}

function normalizeSlug(value) {
  const slug = String(value || '').trim();

  if (!slug) {
    throw new Error('ENTRY_BUILDER_ERROR: canonical_slug required');
  }

  return slug;
}

function buildPublicUrl({ ownerType, canonicalSlug }) {
  return `${WEB_BASE}/${ownerType}/${canonicalSlug}`;
}

function buildCabinetUrl({ ownerType, canonicalSlug }) {
  return `${WEB_BASE}/#/${ownerType}/${canonicalSlug}`;
}

function buildAuthLoginUrl({ ownerType, canonicalSlug }) {
  const params = new URLSearchParams({
    owner_type: ownerType,
    slug: canonicalSlug
  });

  return `${WEB_BASE}/auth/login?${params.toString()}`;
}

/**
 * ENTRY BUILDER v1
 *
 * Контракт:
 * - QR target = только public_url
 * - cabinet_url существует только как handoff ссылка
 * - здесь нет lifecycle/billing вычислений
 * - states приходят снаружи и только прокидываются
 */
export function buildEntry(input = {}) {
  const ownerType = normalizeOwnerType(input.owner_type);
  const canonicalSlug = normalizeSlug(input.canonical_slug);

  const publicUrl = buildPublicUrl({
    ownerType,
    canonicalSlug
  });

  const cabinetUrl = buildCabinetUrl({
    ownerType,
    canonicalSlug
  });

  const authLoginUrl = buildAuthLoginUrl({
    ownerType,
    canonicalSlug
  });

  return {
    ok: true,
    entry: {
      owner_type: ownerType,
      owner_id: input.owner_id ?? null,
      canonical_slug: canonicalSlug,

      public_url: publicUrl,
      cabinet_url: cabinetUrl,
      auth_login_url: authLoginUrl,

      qr_target_url: publicUrl,
      qr_scope: 'public_only',

      lifecycle_state: input.lifecycle_state ?? null,
      access_state: input.access_state ?? null,
      relation_status: input.relation_status ?? null,
      readiness_flag: input.readiness_flag ?? null,

      entry_version: 'v1',
      generated_at: new Date().toISOString()
    }
  };
}

export default {
  buildEntry
};