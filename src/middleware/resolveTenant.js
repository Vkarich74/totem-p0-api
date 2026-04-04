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

    // 1. salon
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

    // 2. billing_subscriptions (Единственный источник истины)
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

    if (billingResult.rowCount > 0) {
      const row = billingResult.rows[0];

      billingAccess = {
        subscription_status: row.subscription_status
      };
    }

    // 3. tenant
    req.tenant = {
      salon_id: salon.id,
      slug: salon.slug,
      owner_type: "salon",
      owner_id: salon.id,
      billing_access: billingAccess
    };

    next();
  } catch (err) {
    console.error("TENANT_RESOLVE_ERROR", err);

    return res.status(500).json({
      ok: false,
      error: "TENANT_RESOLVE_FAILED"
    });
  }
}
// LIFECYCLE ADDITIVE
req.tenant = req.tenant || {}
req.tenant.lifecycle_state = 'active'
req.tenant.billing_state = 'active'
