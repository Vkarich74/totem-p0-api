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

    const result = await pool.query(
      "SELECT id, slug FROM salons WHERE slug = $1 LIMIT 1",
      [slug]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: "TENANT_NOT_FOUND"
      });
    }

    const salon = result.rows[0];

    req.tenant = {
      salon_id: salon.id,
      slug: salon.slug
    };

    next();
  } catch (err) {
    console.error("TENANT_RESOLVE_ERROR", err.message);

    return res.status(500).json({
      ok: false,
      error: "TENANT_RESOLVE_FAILED"
    });
  }
}