// middleware/auth_owner.js
// Strict Bearer auth for owner routes
// Env: OWNER_API_TOKEN (string, required)

export function authOwner(req, res, next) {
  const hdr = req.headers['authorization'];
  if (!hdr || !hdr.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'auth_required' });
  }

  const token = hdr.slice('Bearer '.length).trim();
  const expected = process.env.OWNER_API_TOKEN;

  if (!expected || typeof expected !== 'string') {
    return res.status(500).json({ ok: false, error: 'auth_misconfigured' });
  }

  if (token !== expected) {
    return res.status(403).json({ ok: false, error: 'auth_invalid' });
  }

  req.actor = { role: 'owner' };
  next();
}
