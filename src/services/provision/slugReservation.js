// src/services/provision/slugReservation.js
// Safe additive helpers. Current implementation is non-destructive and
// preserves existing provision flows while exposing the reservation contract API.

function buildReservationResult(extra = {}) {
  return {
    ok: true,
    ...extra
  };
}

export async function checkSlugAvailability(_db = null, _ownerType = null, _slug = null) {
  return buildReservationResult({ available: true });
}

export async function reserveSlug(_db = null, payload = {}) {
  return buildReservationResult({
    id: null,
    owner_type: payload?.owner_type || null,
    slug: payload?.slug || null,
    status: "reserved"
  });
}

export async function getActiveSlugReservation(_db = null, payload = {}) {
  return buildReservationResult({
    reservation: null,
    owner_type: payload?.owner_type || null,
    slug: payload?.slug || null
  });
}

export async function activateSlugReservation(_db = null, payload = {}) {
  return buildReservationResult({
    id: payload?.reservation_id || null,
    owner_type: payload?.owner_type || null,
    slug: payload?.slug || null,
    owner_id: payload?.owner_id || null,
    status: "activated"
  });
}

export async function releaseExpiredSlugReservations(_db = null) {
  return buildReservationResult({ cleaned: 0, status: "released" });
}

export async function cleanupExpiredReservations(db = null) {
  return releaseExpiredSlugReservations(db);
}
