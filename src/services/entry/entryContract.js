import { isStagingRuntime, resolveCorsAllowedOrigins } from "../../staging/stagingSafety.js";

function normalizeText(value){
  return String(value || "").trim();
}

function normalizeOwnerType(ownerType){
  return normalizeText(ownerType).toLowerCase();
}

function normalizeBaseUrl(baseUrl){
  const value = normalizeText(baseUrl);

  if(!value){
    return null;
  }

  return value.replace(/\/+$/g, "");
}

function isValidAbsoluteUrl(value){
  try{
    new URL(String(value || "").trim());
    return true;
  }catch(e){
    return false;
  }
}

export function isForbiddenBookingAppBaseUrl(value){
  const normalizedValue = normalizeBaseUrl(value);

  if(!normalizedValue || !isValidAbsoluteUrl(normalizedValue)){
    return true;
  }

  try{
    const parsedUrl = new URL(normalizedValue);
    const hostname = String(parsedUrl.hostname || "").toLowerCase();
    const pathname = String(parsedUrl.pathname || "").toLowerCase();
    const hash = String(parsedUrl.hash || "").toLowerCase();

    if(hostname === "api.totemv.com" || hostname.endsWith(".api.totemv.com")){
      return true;
    }

    if(pathname.startsWith("/internal") || pathname.startsWith("/api") || hash.includes("/internal") || hash.includes("/api")){
      return true;
    }

    return false;
  }catch(e){
    return true;
  }
}

// Isolated Staging: no implicit Production origin and no ambiguous frontend origin.
function resolveStagingEntryOrigin(kind, suppliedBaseUrl = null){
  const allowed = resolveCorsAllowedOrigins(process.env, []);
  const variableName = kind === "PUBLIC" ? "TOTEM_STAGE_PUBLIC_ORIGIN" : "TOTEM_STAGE_APP_ORIGIN";
  const configured = normalizeBaseUrl(process.env[variableName] || "");
  const origin = configured || (allowed.length === 1 ? allowed[0] : null);

  if(!origin){
    throw new Error("STAGING_" + kind + "_ORIGIN_REQUIRED");
  }

  let parsed;
  try{ parsed = new URL(origin); }
  catch(e){ throw new Error("STAGING_" + kind + "_ORIGIN_INVALID"); }
  if(parsed.origin !== origin || parsed.pathname !== "/" ||
      parsed.search || parsed.hash || !allowed.includes(origin)){
    throw new Error("STAGING_" + kind + "_ORIGIN_REJECTED");
  }

  // A legacy base URL must not inject Production into a Staging response.
  const legacyOrigins = {
    WEB_BASE: process.env.WEB_BASE,
    PUBLIC_WEB_BASE_URL: process.env.PUBLIC_WEB_BASE_URL,
    APP_BASE_URL: process.env.APP_BASE_URL,
    PUBLIC_APP_BASE_URL: process.env.PUBLIC_APP_BASE_URL
  };
  for(const [name,value] of Object.entries(legacyOrigins)){
    if(normalizeText(value) && !allowed.includes(normalizeBaseUrl(value))){
      throw new Error("STAGING_LEGACY_" + name + "_FORBIDDEN");
    }
  }

  if(normalizeText(suppliedBaseUrl) && normalizeBaseUrl(suppliedBaseUrl) !== origin){
    throw new Error("STAGING_" + kind + "_ORIGIN_MISMATCH");
  }
  return origin;
}

function normalizeSlugInput(slug){
  return normalizeText(slug).toLowerCase();
}

export function validateOwnerType(ownerType){
  const safeType = normalizeOwnerType(ownerType);

  if(safeType !== "salon" && safeType !== "master"){
    const err = new Error("INVALID_OWNER_TYPE");
    err.code = "INVALID_OWNER_TYPE";
    throw err;
  }

  return safeType;
}

export function validateCanonicalSlug(slug){
  const safeSlug = normalizeSlugInput(slug);

  if(!safeSlug){
    const err = new Error("INVALID_CANONICAL_SLUG");
    err.code = "INVALID_CANONICAL_SLUG";
    throw err;
  }

  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(safeSlug)){
    const err = new Error("INVALID_CANONICAL_SLUG");
    err.code = "INVALID_CANONICAL_SLUG";
    throw err;
  }

  return safeSlug;
}

export function resolveCanonicalPublicBaseUrl(baseUrl = null){
  if(isStagingRuntime(process.env)){
    return resolveStagingEntryOrigin("PUBLIC", baseUrl);
  }
  const explicitBaseUrl = normalizeBaseUrl(baseUrl);
  const envBaseUrl = normalizeBaseUrl(process.env.PUBLIC_WEB_BASE_URL || process.env.APP_BASE_URL || process.env.PUBLIC_APP_BASE_URL || "");
  const resolvedBaseUrl = explicitBaseUrl || envBaseUrl || "https://totemv.com";

  return normalizeBaseUrl(resolvedBaseUrl);
}

export function resolveCanonicalBookingAppBaseUrl(baseUrl = null){
  if(isStagingRuntime(process.env)){
    return resolveStagingEntryOrigin("APP", baseUrl);
  }
  const candidates = [
    baseUrl,
    process.env.PUBLIC_APP_BASE_URL || "",
    process.env.APP_BASE_URL || ""
  ];

  const resolvedBaseUrl = candidates
    .map((candidate) => normalizeBaseUrl(candidate))
    .find((candidate) => candidate && !isForbiddenBookingAppBaseUrl(candidate))
    || "https://app.totemv.com";

  return normalizeBaseUrl(resolvedBaseUrl);
}

export function buildPublicUrl(ownerType, slug){
  const safeType = validateOwnerType(ownerType);
  const safeSlug = validateCanonicalSlug(slug);

  return `/${safeType}/${safeSlug}`;
}

export function buildCabinetUrl(ownerType, slug){
  const safeType = validateOwnerType(ownerType);
  const safeSlug = validateCanonicalSlug(slug);

  return `#/${safeType}/${safeSlug}`;
}

export function buildPublicAbsoluteUrl(ownerType, slug, baseUrl = null){
  const publicUrl = buildPublicUrl(ownerType, slug);
  const resolvedBaseUrl = resolveCanonicalPublicBaseUrl(baseUrl);

  return `${resolvedBaseUrl}${publicUrl}`;
}

export function buildSalonBookingAbsoluteUrl(salonSlug, baseUrl = null){
  const safeSlug = validateCanonicalSlug(salonSlug);
  const resolvedBaseUrl = resolveCanonicalBookingAppBaseUrl(baseUrl);

  return `${resolvedBaseUrl}/#/booking?salon=${encodeURIComponent(safeSlug)}`;
}

export function buildMasterBookingAbsoluteUrl(salonSlug, masterId, baseUrl = null){
  const safeSlug = validateCanonicalSlug(salonSlug);
  const safeMasterId = normalizeText(masterId);

  if(!safeMasterId){
    const err = new Error("BOOKING_MASTER_ID_REQUIRED");
    err.code = "BOOKING_MASTER_ID_REQUIRED";
    throw err;
  }

  const resolvedBaseUrl = resolveCanonicalBookingAppBaseUrl(baseUrl);

  return `${resolvedBaseUrl}/#/booking?salon=${encodeURIComponent(safeSlug)}&master=${encodeURIComponent(safeMasterId)}`;
}

export function buildCabinetAbsoluteUrl(ownerType, slug, baseUrl = null){
  const cabinetUrl = buildCabinetUrl(ownerType, slug);
  const resolvedBaseUrl = resolveCanonicalPublicBaseUrl(baseUrl);

  return `${resolvedBaseUrl}/${cabinetUrl}`;
}

export function buildAuthLoginUrl(ownerType = null, slug = null, baseUrl = null){
  // Only the isolated Staging runtime uses the SDK HashRouter contract.
  // Ignore a public-site baseUrl: authentication belongs to the app origin.
  if(isStagingRuntime(process.env)){
    const safeType = ownerType ? validateOwnerType(ownerType) : null;
    const safeSlug = slug ? validateCanonicalSlug(slug) : null;
    const query = new URLSearchParams();
    if(safeType){
      query.set("role", safeType === "salon" ? "salon_admin" : "master");
    }
    if(safeSlug){
      query.set("slug", safeSlug);
    }
    const route = `#/auth/login${query.size ? "?" + query.toString() : ""}`;
    const appOrigin = resolveCanonicalBookingAppBaseUrl();
    return {
      auth_login_url: route,
      auth_login_absolute_url: `${appOrigin}/${route}`
    };
  }
  const resolvedBaseUrl = resolveCanonicalPublicBaseUrl(baseUrl);
  const safeType = ownerType ? validateOwnerType(ownerType) : null;
  const safeSlug = slug ? validateCanonicalSlug(slug) : null;

  const query = new URLSearchParams();

  if(safeType){
    query.set("owner_type", safeType);
  }

  if(safeSlug){
    query.set("slug", safeSlug);
  }

  const path = "/auth/login";
  const relativeUrl = query.size ? `${path}?${query.toString()}` : path;

  return {
    auth_login_url: relativeUrl,
    auth_login_absolute_url: `${resolvedBaseUrl}${relativeUrl}`
  };
}

export function buildEntryContract(owner = {}, accessSnapshot = {}, baseUrl = null){
  const ownerType = validateOwnerType(owner?.owner_type);
  const canonicalSlug = validateCanonicalSlug(owner?.canonical_slug);
  const lifecycleState = normalizeText(owner?.lifecycle_state || accessSnapshot?.lifecycle_state || "draft").toLowerCase() || "draft";
  const accessState = normalizeText(owner?.access_state || accessSnapshot?.access_state || "none").toLowerCase() || "none";

  const publicUrl = buildPublicUrl(ownerType, canonicalSlug);
  const publicAbsoluteUrl = buildPublicAbsoluteUrl(ownerType, canonicalSlug, baseUrl);
  const cabinetUrl = buildCabinetUrl(ownerType, canonicalSlug);
  const cabinetAbsoluteUrl = buildCabinetAbsoluteUrl(ownerType, canonicalSlug, baseUrl);
  const authUrls = buildAuthLoginUrl(ownerType, canonicalSlug, baseUrl);

  const entryAllowed = Boolean(accessSnapshot?.public_visible);
  const qrAllowed = Boolean(entryAllowed);
  const readyToOpen = Boolean(entryAllowed);

  return {
    owner_type: ownerType,
    owner_id: owner?.owner_id ?? null,
    canonical_slug: canonicalSlug,
    public_url: publicUrl,
    public_absolute_url: publicAbsoluteUrl,
    cabinet_url: cabinetUrl,
    cabinet_absolute_url: cabinetAbsoluteUrl,
    entry_url: publicUrl,
    entry_mode: "public",
    auth_login_url: authUrls.auth_login_url,
    auth_login_absolute_url: authUrls.auth_login_absolute_url,
    lifecycle_state: lifecycleState,
    access_state: accessState,
    entry_allowed: entryAllowed,
    qr_allowed: qrAllowed,
    ready_to_open: readyToOpen,
    auth_required_for_cabinet: true
  };
}

export default {
  validateOwnerType,
  validateCanonicalSlug,
  resolveCanonicalPublicBaseUrl,
  buildPublicUrl,
  buildCabinetUrl,
  buildPublicAbsoluteUrl,
  buildCabinetAbsoluteUrl,
  buildAuthLoginUrl,
  buildEntryContract,
  isForbiddenBookingAppBaseUrl,
  resolveCanonicalBookingAppBaseUrl,
  buildSalonBookingAbsoluteUrl,
  buildMasterBookingAbsoluteUrl
};
