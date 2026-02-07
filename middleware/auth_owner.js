// middleware/auth_owner.js
import pool from '../db/index.js';

export async function authOwner(req, res, next) {
  const expected = process.env.OWNER_API_TOKEN;

  if (!expected) {
    return res.status(500).json({ error: 'OWNER_API_TOKEN_NOT_CONFIGURED' });
  }

  const auth = String(req.headers['authorization'] || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'OWNER_TOKEN_REQUIRED' });

  const provided = m[1].trim();

  // =========================
  // DEV MODE (CANON)
  // =========================
  if (expected === 'DEV_OWNER_TOKEN') {
    if (provided !== 'DEV_OWNER_TOKEN') {
      return res.status(401).json({ error: 'OWNER_TOKEN_INVALID' });
    }

    // minimal owner context (NO DB)
    req.owner = {
      id: 'dev-owner',
      email: 'dev@local',
      role: 'salon_admin',
      salon_slug: null
    };

    return next();
  }

  // =========================
  // PROD MODE (STRICT)
  // =========================
  if (provided !== expected) {
    return res.status(401).json({ error: 'OWNER_TOKEN_INVALID' });
  }

  let client;
  try {
    client = await pool.connect();

    const { rows } = await client.query(
      `
      SELECT
        id,
        email,
        role,
        salon_slug,
        enabled
      FROM auth_users
      WHERE role = 'salon_admin'
      ORDER BY id ASC
      LIMIT 1
      `
    );

    if (!rows.length) {
      return res.status(403).json({ error: 'OWNER_NOT_FOUND' });
    }

    const user = rows[0];
    if (!user.enabled) {
      return res.status(403).json({ error: 'OWNER_DISABLED' });
    }

    req.owner = {
      id: user.id,
      email: user.email,
      salon_slug: user.salon_slug,
      role: user.role
    };

    return next();
  } catch (err) {
    console.error('[authOwner]', err);
    return res.status(500).json({ error: 'OWNER_LOOKUP_FAILED' });
  } finally {
    if (client) client.release();
  }
}
