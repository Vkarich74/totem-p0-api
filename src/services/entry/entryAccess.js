import { buildEntryContract, validateOwnerType, validateCanonicalSlug } from "./entryContract.js";

function normalizeText(value){
  return String(value || "").trim();
}

function normalizeLifecycleState(rawState, fallback = "draft") {
  const value = normalizeText(rawState).toLowerCase();

  switch (value) {
    case "active":
    case "live":
    case "launched":
    case "activated":
    case "provisioned":
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

function normalizeBillingState(rawState) {
  const value = normalizeText(rawState).toLowerCase();

  switch (value) {
    case "active":
      return "active";
    case "grace":
      return "grace";
    case "overdue":
      return "overdue";
    case "blocked":
      return "blocked";
    default:
      return "none";
  }
}

function buildSalonLifecycleFallback(row) {
  const salonStatus = normalizeText(row?.salon_status).toLowerCase();
  const salonEnabled = row?.salon_enabled;

  if (salonEnabled === false) {
    return "blocked";
  }

  if (salonStatus === "active") {
    return "active";
  }

  if (salonStatus === "blocked") {
    return "blocked";
  }

  if (salonStatus === "expired") {
    return "expired";
  }

  return "draft";
}

function buildMasterLifecycleFallback(row) {
  const masterStatus = normalizeText(row?.master_status).toLowerCase();
  const masterActive = row?.master_active;
  const authEnabled = row?.auth_enabled;

  if (authEnabled === false || masterActive === false || masterStatus === "blocked") {
    return "blocked";
  }

  if (masterStatus === "active" || masterActive === true) {
    return "active";
  }

  if (masterStatus === "expired") {
    return "expired";
  }

  return "draft";
}

export function buildEntryAccessSnapshot(source = {}) {
  const lifecycleState = normalizeLifecycleState(source?.lifecycle_state, "draft");
  const billingState = normalizeBillingState(source?.billing_state);

  const lifecycleAllowsPublic = lifecycleState === "active";
  const billingAllowsPublic = billingState === "active" || billingState === "grace";

  let accessState = "inactive";
  let denyReason = null;

  if (!lifecycleAllowsPublic) {
    accessState = `lifecycle_${lifecycleState}`;
    denyReason = "lifecycle_denied";
  } else if (!billingAllowsPublic) {
    accessState = billingState === "none" ? "billing_missing" : `billing_${billingState}`;
    denyReason = "billing_denied";
  } else {
    accessState = "active";
  }

  return {
    exists: Boolean(source?.owner_id),
    owner_type: source?.owner_type || null,
    owner_id: source?.owner_id || null,
    slug: source?.canonical_slug || null,
    lifecycle_state: lifecycleState,
    billing_state: billingState,
    access_state: accessState,
    deny_reason: denyReason,
    lifecycle_first: true,
    public_visible: lifecycleAllowsPublic && billingAllowsPublic,
    can_book: lifecycleAllowsPublic && billingAllowsPublic,
    can_view_profile: lifecycleAllowsPublic && billingAllowsPublic,
    can_view_metrics: lifecycleAllowsPublic && billingAllowsPublic,
    can_view_bookings: lifecycleAllowsPublic && billingAllowsPublic,
    can_view_availability: lifecycleAllowsPublic && billingAllowsPublic
  };
}

async function findSalonEntryCore(db, slug) {
  const result = await db.query(
    `SELECT
       s.id AS salon_id,
       s.slug AS salon_slug,
       s.name AS salon_name,
       s.status AS salon_status,
       s.enabled AS salon_enabled,
       au.id AS auth_user_id,
       au.email AS owner_email,
       au.enabled AS auth_enabled,
       oi.state AS onboarding_state
     FROM salons s
     LEFT JOIN auth_users au
       ON (
         au.role = 'salon_admin'
         AND (
           au.salon_slug = s.slug
           OR au.salon_id::text = s.id::text
         )
       )
     LEFT JOIN LATERAL (
       SELECT oi.state
       FROM onboarding_identities oi
       WHERE au.email IS NOT NULL
         AND LOWER(oi.email) = LOWER(au.email)
       ORDER BY oi.lead_id DESC
       LIMIT 1
     ) oi ON TRUE
     WHERE s.slug = $1
     ORDER BY au.id ASC NULLS LAST
     LIMIT 1`,
    [slug]
  );

  return result.rows[0] || null;
}

async function findMasterEntryCore(db, slug) {
  const result = await db.query(
    `SELECT
       m.id AS master_id,
       m.slug AS master_slug,
       m.name AS master_name,
       m.active AS master_active,
       m.user_id AS master_user_id,
       au.id AS auth_user_id,
       au.email AS owner_email,
       au.enabled AS auth_enabled,
       oi.state AS onboarding_state,
       CASE
         WHEN m.active = TRUE THEN 'active'
         WHEN m.active = FALSE THEN 'blocked'
         ELSE 'draft'
       END AS master_status
     FROM masters m
     LEFT JOIN auth_users au
       ON (
         au.role = 'master'
         AND (
           au.master_slug = m.slug
           OR au.master_id::text = m.id::text
           OR au.id = m.user_id
         )
       )
     LEFT JOIN LATERAL (
       SELECT oi.state
       FROM onboarding_identities oi
       WHERE au.email IS NOT NULL
         AND LOWER(oi.email) = LOWER(au.email)
       ORDER BY oi.lead_id DESC
       LIMIT 1
     ) oi ON TRUE
     WHERE m.slug = $1
     ORDER BY au.id ASC NULLS LAST
     LIMIT 1`,
    [slug]
  );

  return result.rows[0] || null;
}

async function findBillingState(db, ownerType, ownerId) {
  const result = await db.query(
    `SELECT
       subscription_status,
       blocked_at
     FROM billing_subscriptions
     WHERE owner_type = $1
       AND owner_id = $2
     ORDER BY id DESC
     LIMIT 1`,
    [ownerType, ownerId]
  );

  if (!result.rows.length) {
    return "none";
  }

  const row = result.rows[0];
  return normalizeBillingState(row.blocked_at ? "blocked" : row.subscription_status);
}

export async function resolveEntryOwner(db, ownerType, slug) {
  const safeType = validateOwnerType(ownerType);
  const safeSlug = validateCanonicalSlug(slug);

  if (safeType === "salon") {
    const salon = await findSalonEntryCore(db, safeSlug);

    if (!salon) {
      return null;
    }

    const billingState = await findBillingState(db, "salon", salon.salon_id);
    const lifecycleState = normalizeLifecycleState(salon.onboarding_state, buildSalonLifecycleFallback(salon));

    return {
      owner_type: "salon",
      owner_id: salon.salon_id,
      canonical_slug: salon.salon_slug,
      display_name: salon.salon_name || null,
      lifecycle_state: lifecycleState,
      billing_state: billingState,
      source: salon
    };
  }

  const master = await findMasterEntryCore(db, safeSlug);

  if (!master) {
    return null;
  }

  const billingState = await findBillingState(db, "master", master.master_id);
  const lifecycleState = normalizeLifecycleState(master.onboarding_state, buildMasterLifecycleFallback(master));

  return {
    owner_type: "master",
    owner_id: master.master_id,
    canonical_slug: master.master_slug,
    display_name: master.master_name || null,
    lifecycle_state: lifecycleState,
    billing_state: billingState,
    source: master
  };
}

export async function buildResolvedEntryContract(db, ownerType, slug, baseUrl = null) {
  const resolvedOwner = await resolveEntryOwner(db, ownerType, slug);

  if (!resolvedOwner) {
    return null;
  }

  const accessSnapshot = buildEntryAccessSnapshot(resolvedOwner);
  const contract = buildEntryContract(resolvedOwner, accessSnapshot, baseUrl);

  return {
    owner: resolvedOwner,
    access: accessSnapshot,
    contract
  };
}

export default {
  buildEntryAccessSnapshot,
  resolveEntryOwner,
  buildResolvedEntryContract
};
