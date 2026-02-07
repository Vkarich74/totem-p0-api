// middleware/auth_owner.js
/**
 * OWNER AUTH — TOKEN ONLY (CANON)
 * No DB. No Postgres. No lookups.
 */

export async function authOwner(req, res, next) {
  const expected = process.env.OWNER_API_TOKEN;

  if (!expected) {
    return res.status(500).json({ error: 'OWNER_API_TOKEN_NOT_CONFIGURED' });
  }

  const auth = String(req.headers['authorization'] || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return res.status(401).json({ error: 'OWNER_TOKEN_REQUIRED' });
  }

  const provided = m[1].trim();
  if (provided !== expected) {
    return res.status(401).json({ error: 'OWNER_TOKEN_INVALID' });
  }

  // minimal canonical owner context
  req.owner = {
    role: 'owner',
    source: 'token'
  };

  return next();
}

export function requireOwner(req, res, next) {
  if (!req.owner) {
    return res.status(403).json({ error: 'OWNER_ONLY' });
  }
  return next();
}
