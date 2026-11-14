// US-03: explicit physical US location required; no country/UTC fallback.
import { usTimeError, getUsWallParts } from "./usTime.service.js";

function usLocationError(code, statusCode = 409) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function resolveUsSalonLocation(db, { salonId, locationCode, marketContext } = {}) {
  if (!db || typeof db.query !== "function") {
    throw usLocationError("US_LOCATION_DB_REQUIRED", 500);
  }
  if (marketContext?.market_code !== "US" || marketContext?.country_code !== "US") {
    throw usLocationError("US_LOCATION_MARKET_MISMATCH", 409);
  }

  const id = Number(salonId);
  const code = String(locationCode || "").trim();
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw usLocationError("US_LOCATION_SALON_REQUIRED", 400);
  }
  if (!code || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) {
    throw usLocationError("US_LOCATION_CODE_REQUIRED", 400);
  }

  const result = await db.query(
    `SELECT l.id, l.salon_id, l.location_code, l.state_code, l.city_name,
            l.postal_code, l.timezone_name, l.enabled
       FROM public.us_salon_locations l
       JOIN public.us_timezones z ON z.name = l.timezone_name
       WHERE l.salon_id = $1
         AND l.location_code = $2
       LIMIT 1`,
    [id, code]
  );
  if (!result.rows?.length) {
    throw usLocationError("US_LOCATION_NOT_FOUND", 404);
  }

  const row = result.rows[0];
  if (row.enabled !== true) {
    throw usLocationError("US_LOCATION_INACTIVE", 409);
  }

  const zone = String(row.timezone_name || "").trim();
  // Validates an actual IANA zone, not a browser timezone or market fallback.
  getUsWallParts(new Date("2026-07-15T12:00:00.000Z"), zone);
  return Object.freeze({
    id: Number(row.id),
    salon_id: Number(row.salon_id),
    location_code: String(row.location_code),
    state_code: String(row.state_code),
    city_name: String(row.city_name),
    postal_code: String(row.postal_code),
    timezone: zone,
  });
}

export { usLocationError, resolveUsSalonLocation };
