import { US_COUNTRY_PACK } from "../../market-context/country-packs/US.js";

function problem(code) {
  const error = new Error(code);
  error.code = code;
  error.status = 409;
  return error;
}

export function requestMarketCode(request) {
  return String(
    request?.precheck_result_json?.normalized?.market_code ||
    request?.precheck_result_json?.market_code ||
    ""
  ).trim().toUpperCase();
}

export function isUsSalonActive(salon) {
  return Boolean(
    salon && salon.market_code === "US" &&
    salon.market_active === true &&
    salon.enabled === true &&
    salon.status === "active"
  );
}

export async function readUsSalon(db, salonSlug) {
  const result = await db.query(
    `SELECT s.id, s.slug, s.name, s.status, s.enabled,
            m.code AS market_code, m.active AS market_active
       FROM public.salons s
       LEFT JOIN public.tenant_market_settings tms ON tms.salon_id=s.id
       LEFT JOIN public.markets m ON m.id=tms.market_id
      WHERE lower(s.slug)=lower($1) LIMIT 1`,
    [String(salonSlug || "").trim()]
  );
  return result.rows[0] || null;
}

// Validate from the immutable stored precheck JSON again at approve AND
// immediately before provisioning. US never derives market from browser locale.
export async function assertUsOpenOwnerContract(db, request) {
  if (requestMarketCode(request) !== "US") return false;

  const normalized = request?.precheck_result_json?.normalized || {};
  const rawPhone = String(request.phone_normalized || request.phone_raw || "").trim();
  const contact = US_COUNTRY_PACK.normalizeBusinessPhone(rawPhone);
  if (!contact.ok || contact.phone !== String(request.phone_normalized || "").trim()) {
    throw problem("INVALID_US_PHONE");
  }

  if (request.owner_type === "salon") {
    const state = US_COUNTRY_PACK.normalizeStateCode(normalized.state_code);
    const zip = US_COUNTRY_PACK.normalizeZipCode(normalized.postal_code);
    if (!state.ok || !zip.ok) throw problem("US_LOCATION_FIELDS_REQUIRED");
    const market = await db.query(
      "SELECT code FROM public.markets WHERE code='US' AND active=true LIMIT 1"
    );
    if (market.rows.length !== 1) throw problem("US_MARKET_INACTIVE");
  } else if (request.owner_type === "master") {
    if (request.work_mode !== "attached_to_salon" || !request.salon_slug) {
      throw problem("US_MASTER_SALON_REQUIRED");
    }
    const salon = await readUsSalon(db, request.salon_slug);
    if (!isUsSalonActive(salon)) throw problem("US_ACTIVE_SALON_REQUIRED");
  } else {
    throw problem("OWNER_TYPE_INVALID");
  }

  return true;
}

// Verified US location is a prerequisite for active operational status.
// A stored state/ZIP in the opening request is not a verified location.
export async function assertUsSalonLocationReady(db, salonId) {
  const found = await db.query(
    `SELECT l.id
       FROM public.us_salon_locations l
       JOIN public.us_location_geo_verifications g ON g.location_id=l.id
      WHERE l.salon_id=$1
        AND l.is_primary=true AND l.enabled=true
        AND l.timezone_name IS NOT NULL
        AND l.timezone_name NOT IN ('UTC', 'Etc/UTC')
        AND g.status='VERIFIED_GEOMETRY'
        AND g.resolved_timezone=l.timezone_name
        AND g.census_state_code=l.state_code
        AND g.census_zip5=left(l.postal_code,5)
      LIMIT 1`,
    [salonId]
  );
  if (!found.rows.length) throw problem("US_LOCATION_NOT_READY");
}

export async function assertUsActivationReady(db, request, ownerId) {
  if (requestMarketCode(request) !== "US") return false;

  if (request.owner_type === "salon") {
    const owner = await db.query(
      `SELECT s.id FROM public.salons s
         JOIN public.tenant_market_settings t ON t.salon_id=s.id
         JOIN public.markets m ON m.id=t.market_id
        WHERE s.id=$1 AND m.code='US' AND m.active=true LIMIT 1`,
      [ownerId]
    );
    if (!owner.rows.length) throw problem("US_MARKET_BINDING_INVALID");
    await assertUsSalonLocationReady(db, ownerId);
    return true;
  }

  if (request.owner_type !== "master" ||
      request.work_mode !== "attached_to_salon" || !request.salon_slug) {
    throw problem("US_MASTER_SALON_REQUIRED");
  }

  const owner = await db.query(
    `SELECT ms.salon_id
       FROM public.masters master
       JOIN public.auth_users u ON u.id=master.user_id
       JOIN public.master_salon ms ON ms.master_id=master.id
       JOIN public.salons s ON s.id=ms.salon_id
       JOIN public.tenant_market_settings t ON t.salon_id=s.id
       JOIN public.markets m ON m.id=t.market_id
      WHERE master.id=$1 AND u.enabled=true AND u.role='master'
        AND ms.status='active' AND s.slug=$2
        AND s.status='active' AND s.enabled=true
        AND m.code='US' AND m.active=true LIMIT 1`,
    [ownerId, request.salon_slug]
  );
  if (!owner.rows.length) throw problem("US_MASTER_ACTIVE_SALON_REQUIRED");
  await assertUsSalonLocationReady(db, owner.rows[0].salon_id);
  return true;
}
