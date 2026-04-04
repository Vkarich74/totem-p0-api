import pkg from "pg";

const { Pool } = pkg;

let _pool = null;

function getPool() {
  if (_pool) return _pool;

  _pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  return _pool;
}

function normalizeLifecycleState(rawState, fallback = "draft") {
  const value = String(rawState || "").trim().toLowerCase();

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
  const value = String(rawState || "").trim().toLowerCase();

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

function buildLifecycleFallbackFromSalon(row) {
  const salonStatus = String(row?.salon_status || "").trim().toLowerCase();
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

async function findTenantCore(pool, slug) {
  const result = await pool.query(
    `SELECT
       s.id AS salon_id,
       s.slug AS salon_slug,
       s.name AS salon_name,
       s.status AS salon_status,
       s.enabled AS salon_enabled,
       au.id AS auth_user_id,
       au.email AS owner_email,
       au.role AS owner_role,
       oi.lead_id AS onboarding_lead_id,
       oi.odoo_user_id AS onboarding_odoo_user_id,
       oi.state AS onboarding_state,
       oi.requested_role AS onboarding_requested_role,
       oi.granted_role AS onboarding_granted_role
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
       SELECT
         oi.lead_id,
         oi.odoo_user_id,
         oi.state,
         oi.requested_role,
         oi.granted_role
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

async function findBillingAccess(pool, salonId) {
  const result = await pool.query(
    `SELECT
       id,
       owner_type,
       owner_id,
       subscription_status,
       amount,
       currency,
       wallet_only,
       current_period_start,
       current_period_end,
       blocked_at
     FROM billing_subscriptions
     WHERE owner_type = 'salon'
       AND owner_id = $1
     ORDER BY id DESC
     LIMIT 1`,
    [salonId]
  );

  if (result.rowCount === 0) {
    return {
      billing_access: null,
      billing_state: "none"
    };
  }

  const row = result.rows[0];
  const billingState = normalizeBillingState(
    row.blocked_at ? "blocked" : row.subscription_status
  );

  return {
    billing_access: {
      id: row.id,
      owner_type: row.owner_type,
      owner_id: row.owner_id,
      subscription_status: billingState,
      amount: row.amount,
      currency: row.currency,
      wallet_only: row.wallet_only,
      current_period_start: row.current_period_start || null,
      current_period_end: row.current_period_end || null,
      blocked_at: row.blocked_at || null
    },
    billing_state: billingState
  };
}

export async function resolveTenant(req, res, next) {
  try {
    const slug = req.params.slug;

    if (!slug) {
      return res.status(400).json({
        ok: false,
        error: "TENANT_SLUG_REQUIRED"
      });
    }

    const pool = getPool();
    const tenantRow = await findTenantCore(pool, slug);

    if (!tenantRow) {
      return res.status(404).json({
        ok: false,
        error: "TENANT_NOT_FOUND"
      });
    }

    const { billing_access, billing_state } = await findBillingAccess(pool, tenantRow.salon_id);

    const lifecycleFallback = buildLifecycleFallbackFromSalon(tenantRow);
    const lifecycleState = normalizeLifecycleState(
      tenantRow.onboarding_state,
      lifecycleFallback
    );

    req.tenant = {
      salon_id: tenantRow.salon_id,
      slug: tenantRow.salon_slug,
      salon_name: tenantRow.salon_name || null,
      salon_status: tenantRow.salon_status || null,
      owner_type: "salon",
      owner_id: tenantRow.salon_id,
      auth_user_id: tenantRow.auth_user_id || null,
      owner_email: tenantRow.owner_email || null,
      billing_access,
      billing_state,
      lifecycle_state: lifecycleState,
      onboarding: {
        lead_id: tenantRow.onboarding_lead_id || null,
        odoo_user_id: tenantRow.onboarding_odoo_user_id || null,
        state: tenantRow.onboarding_state || null,
        requested_role: tenantRow.onboarding_requested_role || null,
        granted_role: tenantRow.onboarding_granted_role || null
      }
    };

    return next();
  } catch (err) {
    console.error("TENANT_RESOLVE_ERROR", err);

    return res.status(500).json({
      ok: false,
      error: "TENANT_RESOLVE_FAILED"
    });
  }
}

export default resolveTenant;
