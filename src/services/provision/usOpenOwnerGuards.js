import { US_COUNTRY_PACK } from "../../market-context/country-packs/US.js";
import { US_GEO_VERSION, US_GEO_RUNTIME_SHA256, US_GEO_BORDER_REVIEW_METERS } from "../usAddressGeoVerification.service.js";

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
    salon && salon.market_code === "US" && salon.country_code === "US" && salon.currency_code === "USD" &&
    salon.market_active === true &&
    salon.enabled === true &&
    salon.status === "active"
  );
}

export async function readUsSalon(db, salonSlug) {
  const result = await db.query(
    `SELECT s.id, s.slug, s.name, s.status, s.enabled,
            m.code AS market_code, m.active AS market_active, m.country_code,
            COALESCE(tms.currency_override,m.default_currency) AS currency_code
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
      "SELECT code FROM public.markets WHERE code='US' AND active=true AND country_code='US' AND default_currency='USD' AND country_pack_code='US' AND country_pack_version='1' LIMIT 1"
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
    [
      "SELECT l.id FROM public.us_salon_locations l",
      "JOIN public.us_location_geo_verifications g ON g.location_id=l.id",
      "WHERE l.salon_id=$1 AND l.is_primary=true AND l.enabled=true",
      "AND l.timezone_name NOT IN ('UTC','Etc/UTC')",
      "AND g.status='VERIFIED_GEOMETRY'",
      "AND g.expires_at>now() AND g.checked_at<=now()",
      "AND cardinality(g.reasons)=0 AND g.source_version=$2",
      "AND g.dataset_sha256=$3 AND g.census_benchmark='Public_AR_Current'",
      "AND g.census_state_code=l.state_code",
      "AND g.census_zip5=left(l.postal_code,5)",
      "AND g.resolved_timezone=l.timezone_name",
      "AND g.boundary_distance_m>=$4",
      "AND g.address_fingerprint_sha256=public.us_geo_location_fingerprint(",
      "l.state_code,l.city_name,l.street_line1,l.street_line2,",
      "l.postal_code,l.timezone_name) LIMIT 1",
    ].join(" "),
    [salonId, US_GEO_VERSION, US_GEO_RUNTIME_SHA256, US_GEO_BORDER_REVIEW_METERS]
  );
  if (found.rows.length !== 1) throw problem("US_LOCATION_NOT_READY");
  return Number(found.rows[0].id);
}

export function assertVerifiedUsGeo(draft, geo) {
  if (geo?.status !== "VERIFIED_GEOMETRY" ||
      !Array.isArray(geo.reasons) || geo.reasons.length !== 0 ||
      geo.source_version !== US_GEO_VERSION ||
      geo.dataset_sha256 !== US_GEO_RUNTIME_SHA256 ||
      geo.census_benchmark !== "Public_AR_Current" ||
      geo.census_state_code !== draft.state_code ||
      geo.census_zip5 !== draft.postal_code.slice(0, 5) ||
      geo.resolved_timezone !== draft.timezone_name ||
      Number(geo.boundary_distance_m) < US_GEO_BORDER_REVIEW_METERS ||
      !(new Date(geo.expires_at).getTime() > Date.now()) ||
      !(new Date(geo.checked_at).getTime() <= Date.now()) ||
      !/^[a-f0-9]{64}$/.test(String(geo.address_fingerprint_sha256 || ""))) {
    throw problem("US_GEO_VERIFICATION_REQUIRED");
  }
  return true;
}

export async function assertUsActivationReady(db, request, ownerId) {
  if (requestMarketCode(request) !== "US") return false;
  await assertUsOpenOwnerContract(db, request);
  if (!Number.isSafeInteger(Number(ownerId)) || Number(ownerId) <= 0 ||
      !Number.isSafeInteger(Number(request.created_auth_user_id))) {
    throw problem("US_OWNER_IDENTITY_NOT_READY");
  }

  if (request.owner_type === "salon") {
    const owner = await db.query(
      [
        "SELECT s.id FROM public.salons s",
        "JOIN public.tenant_market_settings t ON t.salon_id=s.id",
        "JOIN public.markets m ON m.id=t.market_id",
        "JOIN public.owner_salon os ON os.salon_id=s.id AND os.status='active'",
        "JOIN public.auth_users u ON u.id=os.owner_id",
        "WHERE s.id=$1 AND u.id=$2 AND u.enabled=true AND u.role='salon_admin'",
        "AND m.code='US' AND m.country_code='US' AND m.active=true",
        "AND COALESCE(t.currency_override,m.default_currency)='USD' LIMIT 1",
      ].join(" "),
      [ownerId, request.created_auth_user_id]
    );
    if (owner.rows.length !== 1) throw problem("US_MARKET_BINDING_INVALID");
    await assertUsSalonLocationReady(db, Number(ownerId));
    return true;
  }

  if (request.owner_type !== "master" ||
      request.work_mode !== "attached_to_salon" || !request.salon_slug) {
    throw problem("US_MASTER_SALON_REQUIRED");
  }
  const relation = await db.query(
    [
      "SELECT ms.salon_id FROM public.masters master",
      "JOIN public.auth_users u ON u.id=master.user_id",
      "JOIN public.master_salon ms ON ms.master_id=master.id",
      "JOIN public.salons s ON s.id=ms.salon_id",
      "JOIN public.tenant_market_settings t ON t.salon_id=s.id",
      "JOIN public.markets m ON m.id=t.market_id",
      "WHERE master.id=$1 AND master.user_id=$2 AND u.enabled=true AND u.role='master'",
      "AND ms.status='active' AND s.slug=$3",
      "AND s.status='active' AND s.enabled=true",
      "AND m.code='US' AND m.country_code='US' AND m.active=true",
      "AND COALESCE(t.currency_override,m.default_currency)='USD'",
    ].join(" "),
    [ownerId, request.created_auth_user_id, request.salon_slug]
  );
  if (relation.rows.length !== 1) throw problem("US_MASTER_ACTIVE_SALON_REQUIRED");
  await assertUsSalonLocationReady(db, Number(relation.rows[0].salon_id));
  return true;
}
