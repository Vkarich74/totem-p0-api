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

function normalizeLifecycleState(rawState) {
  switch (String(rawState || "").trim().toLowerCase()) {
    case "active":
      return "active";
    case "grace":
      return "active";
    case "pending_payment":
      return "pending_payment";
    case "blocked":
      return "blocked";
    case "expired":
      return "expired";
    case "onboarding":
      return "onboarding";
    case "draft":
    default:
      return "draft";
  }
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

    const salonResult = await pool.query(
      "SELECT id, slug FROM salons WHERE slug = $1 LIMIT 1",
      [slug]
    );

    if (salonResult.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: "TENANT_NOT_FOUND"
      });
    }

    const salon = salonResult.rows[0];

    const billingResult = await pool.query(
      `
      SELECT subscription_status
      FROM billing_subscriptions
      WHERE owner_type = 'salon'
        AND owner_id = $1
      LIMIT 1
      `,
      [salon.id]
    );

    let billingAccess = null;
    let billingState = "none";

    if (billingResult.rowCount > 0) {
      const row = billingResult.rows[0];
      billingState = String(row.subscription_status || "none").trim().toLowerCase();

      billingAccess = {
        subscription_status: billingState
      };
    }

    req.tenant = {
      salon_id: salon.id,
      slug: salon.slug,
      owner_type: "salon",
      owner_id: salon.id,
      billing_access: billingAccess,
      billing_state: billingState,
      lifecycle_state: normalizeLifecycleState(
        billingState === "active" || billingState === "grace" ? "active" : "draft"
      )
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
