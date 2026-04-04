// src/services/provision/slugReservation.js
// STEP C — slug reservation implementation.
// Safe, additive implementation with lazy table bootstrap, TTL cleanup,
// canonical availability checks, reservation activation and compatibility aliases.

const RESERVATION_TTL_HOURS = 72;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeOwnerType(value) {
  const raw = normalizeText(value).toLowerCase();

  if (raw === "salon" || raw === "salons") {
    return "salon";
  }

  if (raw === "master" || raw === "masters") {
    return "master";
  }

  const err = new Error("INVALID_OWNER_TYPE");
  err.code = "INVALID_OWNER_TYPE";
  err.status = 400;
  throw err;
}

function normalizeSlug(value) {
  const raw = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!raw) {
    const err = new Error("SLUG_REQUIRED");
    err.code = "SLUG_REQUIRED";
    err.status = 400;
    throw err;
  }

  return raw;
}

function buildReservationResult(extra = {}) {
  return {
    ok: true,
    ...extra,
  };
}

function buildConflictError(code, details = null) {
  const err = new Error(code);
  err.code = code;
  err.status = 409;
  err.details = details;
  return err;
}

function getCanonicalTable(ownerType) {
  if (ownerType === "salon") {
    return "salons";
  }

  if (ownerType === "master") {
    return "masters";
  }

  const err = new Error("INVALID_OWNER_TYPE");
  err.code = "INVALID_OWNER_TYPE";
  err.status = 400;
  throw err;
}

export async function ensureReservationTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS slug_reservations(
      id BIGSERIAL PRIMARY KEY,
      owner_type TEXT NOT NULL,
      owner_id BIGINT NULL,
      slug TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'reserved',
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      activated_at TIMESTAMPTZ NULL,
      released_at TIMESTAMPTZ NULL,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '${RESERVATION_TTL_HOURS} hours'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS slug_reservations_active_slug_idx
    ON slug_reservations(owner_type, LOWER(slug))
    WHERE status IN ('reserved', 'activated')
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS slug_reservations_status_expires_idx
    ON slug_reservations(status, expires_at)
  `);
}

function mapReservationRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id ?? null,
    owner_type: row.owner_type ?? null,
    owner_id: row.owner_id ?? null,
    slug: row.slug ?? null,
    status: row.status ?? null,
    meta: row.meta ?? {},
    reserved_at: row.reserved_at ?? null,
    activated_at: row.activated_at ?? null,
    released_at: row.released_at ?? null,
    expires_at: row.expires_at ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

async function cleanupExpired(db, ownerType = null, slug = null) {
  await ensureReservationTable(db);

  const conditions = ["status = 'reserved'", "expires_at <= NOW()"];
  const values = [];

  if (ownerType) {
    values.push(ownerType);
    conditions.push(`owner_type = $${values.length}`);
  }

  if (slug) {
    values.push(slug);
    conditions.push(`LOWER(slug) = LOWER($${values.length})`);
  }

  const result = await db.query(
    `UPDATE slug_reservations
     SET status = 'released',
         released_at = NOW(),
         updated_at = NOW(),
         meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('release_reason', 'ttl_expired')
     WHERE ${conditions.join(" AND ")}
     RETURNING id`,
    values
  );

  return result.rowCount || 0;
}

async function canonicalSlugExists(db, ownerType, slug) {
  const tableName = getCanonicalTable(ownerType);
  const result = await db.query(
    `SELECT id, slug
     FROM ${tableName}
     WHERE LOWER(slug) = LOWER($1)
     LIMIT 1`,
    [slug]
  );

  return result.rows[0] || null;
}

async function findActiveReservation(db, payload = {}) {
  await ensureReservationTable(db);

  const ownerType = payload.owner_type ? normalizeOwnerType(payload.owner_type) : null;
  const slug = payload.slug ? normalizeSlug(payload.slug) : null;
  const reservationId = payload.reservation_id ? Number(payload.reservation_id) : null;

  const conditions = ["status = 'reserved'", "expires_at > NOW()"];
  const values = [];

  if (Number.isInteger(reservationId) && reservationId > 0) {
    values.push(reservationId);
    conditions.push(`id = $${values.length}`);
  }

  if (ownerType) {
    values.push(ownerType);
    conditions.push(`owner_type = $${values.length}`);
  }

  if (slug) {
    values.push(slug);
    conditions.push(`LOWER(slug) = LOWER($${values.length})`);
  }

  const result = await db.query(
    `SELECT
       id,
       owner_type,
       owner_id,
       slug,
       status,
       meta,
       reserved_at,
       activated_at,
       released_at,
       expires_at,
       created_at,
       updated_at
     FROM slug_reservations
     WHERE ${conditions.join(" AND ")}
     ORDER BY id DESC
     LIMIT 1`,
    values
  );

  return mapReservationRow(result.rows[0] || null);
}

export async function checkSlugAvailability(db, ownerTypeInput, slugInput, payload = {}) {
  const ownerType = normalizeOwnerType(ownerTypeInput);
  const slug = normalizeSlug(slugInput);

  await cleanupExpired(db, ownerType, slug);

  const canonical = await canonicalSlugExists(db, ownerType, slug);
  if (canonical) {
    return buildReservationResult({
      available: false,
      owner_type: ownerType,
      slug,
      reason: "canonical_exists",
      canonical_owner_id: canonical.id,
    });
  }

  const activeReservation = await findActiveReservation(db, {
    owner_type: ownerType,
    slug,
    reservation_id: payload?.reservation_id || null,
  });

  if (activeReservation) {
    return buildReservationResult({
      available: false,
      owner_type: ownerType,
      slug,
      reason: "reserved",
      reservation: activeReservation,
    });
  }

  return buildReservationResult({
    available: true,
    owner_type: ownerType,
    slug,
    reason: null,
    reservation: null,
  });
}

export async function reserveSlug(db, payload = {}) {
  const ownerType = normalizeOwnerType(payload.owner_type);
  const slug = normalizeSlug(payload.slug);
  const meta = payload?.meta && typeof payload.meta === "object" ? payload.meta : {};

  await cleanupExpired(db, ownerType, slug);

  const availability = await checkSlugAvailability(db, ownerType, slug);
  if (!availability.available) {
    throw buildConflictError("SLUG_NOT_AVAILABLE", {
      owner_type: ownerType,
      slug,
      reason: availability.reason,
    });
  }

  const inserted = await db.query(
    `INSERT INTO slug_reservations(
       owner_type,
       owner_id,
       slug,
       status,
       meta,
       reserved_at,
       expires_at,
       created_at,
       updated_at
     )
     VALUES($1, NULL, $2, 'reserved', $3::jsonb, NOW(), NOW() + INTERVAL '${RESERVATION_TTL_HOURS} hours', NOW(), NOW())
     RETURNING
       id,
       owner_type,
       owner_id,
       slug,
       status,
       meta,
       reserved_at,
       activated_at,
       released_at,
       expires_at,
       created_at,
       updated_at`,
    [ownerType, slug, JSON.stringify(meta)]
  );

  const reservation = mapReservationRow(inserted.rows[0] || null);

  return buildReservationResult({
    ...reservation,
    reservation,
  });
}

export async function getActiveReservation(db, payload = {}) {
  const ownerType = payload.owner_type ? normalizeOwnerType(payload.owner_type) : null;
  const slug = payload.slug ? normalizeSlug(payload.slug) : null;

  await cleanupExpired(db, ownerType, slug);

  const reservation = await findActiveReservation(db, {
    owner_type: ownerType,
    slug,
    reservation_id: payload.reservation_id || null,
  });

  return buildReservationResult({
    owner_type: ownerType,
    slug,
    reservation,
  });
}

export async function getActiveSlugReservation(db, payload = {}) {
  return getActiveReservation(db, payload);
}

export async function activateReservedSlug(db, payload = {}) {
  await ensureReservationTable(db);

  const ownerType = normalizeOwnerType(payload.owner_type);
  const slug = normalizeSlug(payload.slug);
  const ownerId = Number(payload.owner_id);
  const reservationId = payload.reservation_id ? Number(payload.reservation_id) : null;

  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    const err = new Error("OWNER_ID_REQUIRED");
    err.code = "OWNER_ID_REQUIRED";
    err.status = 400;
    throw err;
  }

  await cleanupExpired(db, ownerType, slug);

  const activeReservation = await findActiveReservation(db, {
    owner_type: ownerType,
    slug,
    reservation_id: reservationId,
  });

  if (!activeReservation) {
    throw buildConflictError("SLUG_RESERVATION_NOT_FOUND", {
      owner_type: ownerType,
      slug,
      reservation_id: reservationId,
    });
  }

  const updated = await db.query(
    `UPDATE slug_reservations
     SET owner_id = $2,
         status = 'activated',
         activated_at = NOW(),
         expires_at = NOW() + INTERVAL '3650 days',
         updated_at = NOW(),
         meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('activated_from', 'create_flow')
     WHERE id = $1
     RETURNING
       id,
       owner_type,
       owner_id,
       slug,
       status,
       meta,
       reserved_at,
       activated_at,
       released_at,
       expires_at,
       created_at,
       updated_at`,
    [activeReservation.id, ownerId]
  );

  const reservation = mapReservationRow(updated.rows[0] || null);

  return buildReservationResult({
    ...reservation,
    reservation,
  });
}

export async function activateSlugReservation(db, payload = {}) {
  return activateReservedSlug(db, payload);
}

export async function releaseExpiredSlugReservations(db, payload = {}) {
  const ownerType = payload?.owner_type ? normalizeOwnerType(payload.owner_type) : null;
  const slug = payload?.slug ? normalizeSlug(payload.slug) : null;
  const cleaned = await cleanupExpired(db, ownerType, slug);

  return buildReservationResult({
    cleaned,
    status: "released",
    owner_type: ownerType,
    slug,
  });
}

export async function cleanupExpiredReservations(db, payload = {}) {
  return releaseExpiredSlugReservations(db, payload);
}


export async function initializeSlugReservationLayer(db) {
  await ensureReservationTable(db);
  return buildReservationResult({ initialized: true, ttl_hours: RESERVATION_TTL_HOURS });
}
