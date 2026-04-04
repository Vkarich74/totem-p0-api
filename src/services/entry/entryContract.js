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
  const explicitBaseUrl = normalizeBaseUrl(baseUrl);
  const envBaseUrl = normalizeBaseUrl(process.env.PUBLIC_WEB_BASE_URL || process.env.APP_BASE_URL || process.env.PUBLIC_APP_BASE_URL || "");
  const resolvedBaseUrl = explicitBaseUrl || envBaseUrl || "https://www.totemv.com";

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

export function buildCabinetAbsoluteUrl(ownerType, slug, baseUrl = null){
  const cabinetUrl = buildCabinetUrl(ownerType, slug);
  const resolvedBaseUrl = resolveCanonicalPublicBaseUrl(baseUrl);

  return `${resolvedBaseUrl}/${cabinetUrl}`;
}

export function buildAuthLoginUrl(ownerType = null, slug = null, baseUrl = null){
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
  buildEntryContract
};
