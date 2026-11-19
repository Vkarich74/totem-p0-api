import {
  assertUsSalonLocationReady,
  assertVerifiedUsGeo,
} from "./usOpenOwnerGuards.js";

function conflict(code) {
  const error = new Error(code);
  error.code = code;
  error.status = 409;
  return error;
}

function sameLocation(row, draft) {
  return row.location_code === draft.location_code &&
    row.state_code === draft.state_code &&
    row.city_name === draft.city_name &&
    row.street_line1 === draft.street_line1 &&
    String(row.street_line2 || "") === String(draft.street_line2 || "") &&
    row.postal_code === draft.postal_code &&
    row.timezone_name === draft.timezone_name &&
    row.is_primary === true;
}

// Caller owns a PostgreSQL transaction and has verified the Admin request,
// owner identity, US tenant binding, and locked the matching salon row.
// This function never fabricates a location or overwrites an active address.
// SQL constraints and the existing US-07 trigger independently verify evidence.
export async function persistVerifiedUsAdminPrimaryLocation(db, { salonId, draft, geo }) {
  if (!Number.isSafeInteger(Number(salonId)) || Number(salonId) < 1 ||
      !draft || draft.is_primary !== true) {
    throw conflict("US_PRIMARY_LOCATION_CONTRACT_INVALID");
  }
  assertVerifiedUsGeo(draft, geo);

  const existing = await db.query(
    [
      "SELECT id,location_code,state_code,city_name,street_line1,",
      "street_line2,postal_code,timezone_name,is_primary,enabled",
      "FROM public.us_salon_locations",
      "WHERE salon_id=$1 AND (is_primary=true OR location_code=$2) FOR UPDATE",
    ].join(" "),
    [salonId, draft.location_code]
  );

  if (existing.rows.length) {
    if (existing.rows.length === 1 &&
        existing.rows[0].enabled === true &&
        sameLocation(existing.rows[0], draft)) {
      const readyId = await assertUsSalonLocationReady(db, Number(salonId));
      if (readyId !== Number(existing.rows[0].id)) {
        throw conflict("US_PRIMARY_LOCATION_READBACK_MISMATCH");
      }
      return { id: readyId, idempotent: true };
    }
    throw conflict("US_PRIMARY_LOCATION_ALREADY_EXISTS");
  }

  const newLocation = await db.query(
    [
      "INSERT INTO public.us_salon_locations",
      "(salon_id,location_code,state_code,city_name,street_line1,",
      "street_line2,postal_code,timezone_name,is_primary,enabled)",
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,false)",
      "RETURNING id",
    ].join(" "),
    [
      salonId,draft.location_code,draft.state_code,draft.city_name,
      draft.street_line1,draft.street_line2 || null,draft.postal_code,
      draft.timezone_name,
    ]
  );
  if (newLocation.rows.length !== 1) {
    throw conflict("US_PRIMARY_LOCATION_PERSISTENCE_FAILED");
  }
  const locationId = Number(newLocation.rows[0].id);

  await db.query(
    [
      "INSERT INTO public.us_location_geo_verifications",
      "(location_id,status,reasons,address_fingerprint_sha256,",
      "source_version,dataset_sha256,census_benchmark,",
      "census_matched_address,census_state_code,census_zip5,",
      "resolved_timezone,latitude,longitude,boundary_distance_m,",
      "checked_at,expires_at,updated_at)",
      "VALUES ($1,$2,$3::text[],$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,",
      "$14,$15::timestamptz,$16::timestamptz,now())",
    ].join(" "),
    [
      locationId,geo.status,geo.reasons,geo.address_fingerprint_sha256,
      geo.source_version,geo.dataset_sha256,geo.census_benchmark,
      geo.census_matched_address,geo.census_state_code,geo.census_zip5,
      geo.resolved_timezone,geo.latitude,geo.longitude,
      geo.boundary_distance_m,geo.checked_at,geo.expires_at,
    ]
  );

  // The US-07 trigger rejects activation without fresh, identical Census/IANA
  // evidence, so this write is safe only after the verification row exists.
  const activation = await db.query(
    [
      "UPDATE public.us_salon_locations SET enabled=true,updated_at=now()",
      "WHERE id=$1 AND salon_id=$2 AND is_primary=true AND enabled=false",
      "RETURNING id",
    ].join(" "),
    [locationId,salonId]
  );
  if (activation.rows.length !== 1) {
    throw conflict("US_PRIMARY_LOCATION_ACTIVATION_FAILED");
  }
  const readyId = await assertUsSalonLocationReady(db, Number(salonId));
  if (readyId !== locationId) {
    throw conflict("US_PRIMARY_LOCATION_READBACK_MISMATCH");
  }
  return { id:locationId, idempotent:false };
}
