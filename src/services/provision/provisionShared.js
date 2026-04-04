function normalizeText(value){
  return String(value || "").trim();
}

function normalizeSlugPart(value){
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function normalizeSlug(value){
  return normalizeSlugPart(value);
}

export function buildDeterministicSlug(base, suffix = null){
  const safeBase = normalizeSlug(base) || "item";

  if(suffix === null || suffix === undefined || suffix === ""){
    return safeBase;
  }

  const safeSuffix = normalizeSlugPart(String(suffix));

  if(!safeSuffix){
    return safeBase;
  }

  return `${safeBase}-${safeSuffix}`;
}

async function ensureUniqueSlug(db, tableName, baseValue, columnName = "slug"){
  const safeBase = normalizeSlug(baseValue) || tableName.slice(0, -1) || "item";

  const existing = await db.query(
    `SELECT ${columnName}
     FROM ${tableName}
     WHERE ${columnName} = $1
        OR ${columnName} LIKE $2
     ORDER BY ${columnName} ASC`,
    [safeBase, `${safeBase}-%`]
  );

  const used = new Set(
    existing.rows
      .map((row) => String(row?.[columnName] || "").trim())
      .filter(Boolean)
  );

  if(!used.has(safeBase)){
    return safeBase;
  }

  let counter = 2;

  while(true){
    const candidate = `${safeBase}-${counter}`;
    if(!used.has(candidate)){
      return candidate;
    }
    counter += 1;
  }
}

export async function ensureUniqueSalonSlug(db, slugBase){
  return ensureUniqueSlug(db, "salons", slugBase, "slug");
}

export async function ensureUniqueMasterSlug(db, slugBase){
  return ensureUniqueSlug(db, "masters", slugBase, "slug");
}

export function validateSalonProvisionInput(payload = {}){
  const email = normalizeText(payload.email).toLowerCase();
  const name = normalizeText(payload.name) || null;
  const salonName = normalizeText(payload.salon_name);
  const requestedRole = normalizeText(payload.requested_role || "salon_admin");

  if(!email){
    const err = new Error("EMAIL_REQUIRED");
    err.code = "EMAIL_REQUIRED";
    throw err;
  }

  if(!salonName){
    const err = new Error("SALON_NAME_REQUIRED");
    err.code = "SALON_NAME_REQUIRED";
    throw err;
  }

  if(requestedRole !== "salon_admin"){
    const err = new Error("INVALID_ROLE");
    err.code = "INVALID_ROLE";
    throw err;
  }

  return {
    email,
    name,
    salon_name: salonName,
    salon_slug: normalizeSlug(payload.salon_slug || salonName),
    phone: normalizeText(payload.phone) || null,
    city: normalizeText(payload.city) || null,
    description: normalizeText(payload.description) || null,
    logo_url: normalizeText(payload.logo_url) || null,
    cover_url: normalizeText(payload.cover_url) || null,
    slogan: normalizeText(payload.slogan) || null,
    lead_id: normalizeText(payload.lead_id) || null,
    odoo_user_id: normalizeText(payload.odoo_user_id) || null,
    requested_role: requestedRole
  };
}

export function validateMasterProvisionInput(payload = {}){
  const email = normalizeText(payload.email).toLowerCase();
  const name = normalizeText(payload.name);
  const requestedRole = normalizeText(payload.requested_role || "master");
  const passwordHash = normalizeText(payload.password_hash);

  if(!email){
    const err = new Error("EMAIL_REQUIRED");
    err.code = "EMAIL_REQUIRED";
    throw err;
  }

  if(!name){
    const err = new Error("MASTER_NAME_REQUIRED");
    err.code = "MASTER_NAME_REQUIRED";
    throw err;
  }

  if(requestedRole !== "master"){
    const err = new Error("INVALID_ROLE");
    err.code = "INVALID_ROLE";
    throw err;
  }

  if(!passwordHash){
    const err = new Error("PASSWORD_HASH_REQUIRED");
    err.code = "PASSWORD_HASH_REQUIRED";
    throw err;
  }

  return {
    email,
    name,
    master_slug: normalizeSlug(payload.master_slug || name),
    lead_id: normalizeText(payload.lead_id) || null,
    odoo_user_id: normalizeText(payload.odoo_user_id) || null,
    requested_role: requestedRole,
    password_hash: passwordHash
  };
}

export function buildProvisionMeta({ created = false, updated = false, idempotent = false } = {}){
  return {
    created: Boolean(created),
    updated: Boolean(updated),
    idempotent: Boolean(idempotent)
  };
}

export async function findExistingAuthUser(db, email, role){
  const result = await db.query(
    `SELECT
       id,
       email,
       role,
       salon_slug,
       master_slug,
       enabled,
       salon_id,
       master_id,
       created_at
     FROM auth_users
     WHERE email = $1
       AND role = $2
     LIMIT 1`,
    [String(email || "").trim().toLowerCase(), String(role || "").trim()]
  );

  return result.rows[0] || null;
}

export async function upsertUserDefaultSalon(db, userId, defaultSalonSlug){
  const result = await db.query(
    `INSERT INTO user_default_salon(
       user_id,
       default_salon_slug,
       updated_at
     )
     VALUES($1, $2, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       default_salon_slug = EXCLUDED.default_salon_slug,
       updated_at = NOW()
     RETURNING user_id, default_salon_slug, updated_at`,
    [userId, defaultSalonSlug]
  );

  return result.rows[0] || null;
}

export async function upsertOwnerSalonLink(db, ownerId, salonId){
  const existing = await db.query(
    `SELECT id, owner_id, salon_id, status, created_at
     FROM owner_salon
     WHERE owner_id=$1
       AND salon_id=$2
     LIMIT 1`,
    [String(ownerId), salonId]
  );

  if(existing.rows.length){
    if(existing.rows[0].status === "active"){
      return existing.rows[0];
    }

    const updated = await db.query(
      `UPDATE owner_salon
       SET status='active'
       WHERE id=$1
       RETURNING id, owner_id, salon_id, status, created_at`,
      [existing.rows[0].id]
    );

    return updated.rows[0] || existing.rows[0];
  }

  const inserted = await db.query(
    `INSERT INTO owner_salon(
       owner_id,
       salon_id,
       status,
       created_at
     )
     VALUES($1, $2, 'active', NOW())
     RETURNING id, owner_id, salon_id, status, created_at`,
    [String(ownerId), salonId]
  );

  return inserted.rows[0] || null;
}

export async function createOnboardingIdentityIfNeeded(db, payload = {}){
  const leadId = normalizeText(payload.lead_id);
  const email = normalizeText(payload.email).toLowerCase();
  const requestedRole = normalizeText(payload.requested_role);
  const grantedRole = normalizeText(payload.granted_role || requestedRole);
  const odooUserId = normalizeText(payload.odoo_user_id);

  if(!leadId){
    return null;
  }

  const result = await db.query(
    `INSERT INTO onboarding_identities(
       lead_id,
       odoo_user_id,
       email,
       requested_role,
       granted_role,
       state,
       created_at
     )
     VALUES($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (lead_id)
     DO UPDATE SET
       odoo_user_id = EXCLUDED.odoo_user_id,
       email = EXCLUDED.email,
       requested_role = EXCLUDED.requested_role,
       granted_role = EXCLUDED.granted_role,
       state = EXCLUDED.state
     RETURNING *`,
    [
      leadId,
      odooUserId || `odoo:${leadId}`,
      email,
      requestedRole,
      grantedRole,
      normalizeText(payload.state || "PROVISIONED")
    ]
  );

  return result.rows[0] || null;
}

export async function createOnboardingTransition(db, payload = {}){
  const coreUserId = Number(payload.core_user_id);
  const fromState = normalizeText(payload.from_state || "PENDING");
  const toState = normalizeText(payload.to_state || "PROVISIONED");
  const reason = normalizeText(payload.reason || "provision");

  if(!Number.isInteger(coreUserId) || coreUserId <= 0){
    return null;
  }

  const result = await db.query(
    `INSERT INTO onboarding_state_transitions(
       core_user_id,
       from_state,
       to_state,
       reason,
       created_at
     )
     VALUES($1, $2, $3, $4, NOW())
     RETURNING *`,
    [coreUserId, fromState, toState, reason]
  );

  return result.rows[0] || null;
}

export function normalizeLifecycleState(value, fallback = "draft"){
  const raw = normalizeText(value).toLowerCase();

  switch(raw){
    case "active":
    case "live":
    case "launched":
    case "activated":
      return "active";
    case "grace":
      return "active";
    case "pending_payment":
    case "payment_pending":
    case "awaiting_payment":
      return "pending_payment";
    case "blocked":
    case "disabled":
      return "blocked";
    case "expired":
    case "archived":
      return "expired";
    case "provisioned":
    case "onboarding":
    case "pending":
    case "invited":
      return "onboarding";
    case "draft":
      return "draft";
    default:
      return fallback;
  }
}

export function buildCanonicalUrls(ownerType, canonicalSlug){
  const safeType = normalizeText(ownerType).toLowerCase();
  const safeSlug = normalizeText(canonicalSlug);

  if(!safeType || !safeSlug){
    return {
      public_url: null,
      cabinet_url: null
    };
  }

  return {
    public_url: `/${safeType}/${safeSlug}`,
    cabinet_url: `#/${safeType}/${safeSlug}`
  };
}

export function buildCanonicalProvisionResponse(payload = {}){
  const ownerType = normalizeText(payload.owner_type).toLowerCase() || null;
  const canonicalSlug = normalizeText(payload.canonical_slug) || null;
  const urls = buildCanonicalUrls(ownerType, canonicalSlug);
  const lifecycleState = normalizeLifecycleState(payload.lifecycle_state, "draft");
  const accessState = normalizeText(payload.access_state || "none").toLowerCase() || "none";
  const relationStatus = normalizeText(payload.relation_status) || null;
  const readinessFlag = normalizeText(payload.readiness_flag || "draft").toLowerCase() || "draft";

  return {
    ok: payload.ok !== false,
    flow: normalizeText(payload.flow) || null,
    owner_type: ownerType,
    owner_id: payload.owner_id ?? null,
    canonical_slug: canonicalSlug,
    public_url: payload.public_url || urls.public_url,
    cabinet_url: payload.cabinet_url || urls.cabinet_url,
    lifecycle_state: lifecycleState,
    access_state: accessState,
    relation_status: relationStatus,
    readiness_flag: readinessFlag,
    result: payload.result ?? null,
    errors: payload.errors ?? null,
    meta: {
      ...(payload.meta || {})
    }
  };
}

export function resolveProvisionError(err){
  const code = String(err?.code || err?.message || "PROVISION_FAILED").trim();

  if(code === "23505"){
    return {
      status: 409,
      error: "UNIQUE_CONSTRAINT_VIOLATION"
    };
  }

  const badRequestCodes = new Set([
    "EMAIL_REQUIRED",
    "SALON_NAME_REQUIRED",
    "MASTER_NAME_REQUIRED",
    "INVALID_ROLE",
    "PASSWORD_HASH_REQUIRED",
    "SALON_SLUG_REQUIRED",
    "MASTER_SLUG_REQUIRED",
    "INVALID_BIND_MODE",
    "INVALID_EFFECTIVE_FROM",
    "INVALID_CONTRACT_TERMS",
    "INVALID_OWNER_TYPE",
    "SLUG_REQUIRED",
    "OWNER_ID_REQUIRED"
  ]);

  if(badRequestCodes.has(code)){
    return {
      status: 400,
      error: code
    };
  }

  const notFoundCodes = new Set([
    "SALON_NOT_FOUND",
    "MASTER_NOT_FOUND",
    "MASTER_SALON_LINK_NOT_FOUND"
  ]);

  if(notFoundCodes.has(code)){
    return {
      status: 404,
      error: code
    };
  }

  const conflictCodes = new Set([
    "AUTH_USER_ALREADY_EXISTS_WITHOUT_SALON",
    "AUTH_USER_ALREADY_EXISTS_WITHOUT_MASTER",
    "SLUG_NOT_AVAILABLE",
    "SLUG_RESERVATION_NOT_FOUND"
  ]);

  if(conflictCodes.has(code)){
    return {
      status: 409,
      error: code
    };
  }

  return {
    status: 500,
    error: code || "PROVISION_FAILED"
  };
}
