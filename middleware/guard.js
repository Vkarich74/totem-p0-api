export function requireSystem(req, res, next) {
  if (process.env.ENABLE_SYSTEM_ROUTES !== 'true') {
    return res.status(403).json({ error: 'SYSTEM_ROUTES_DISABLED' });
  }

  const actorType = req.headers['x-actor-type'];
  if (actorType !== 'system') {
    return res.status(403).json({ error: 'SYSTEM_ONLY' });
  }

  next();
}

export function requireProd(req, res, next) {
  if (process.env.NODE_ENV !== 'production') {
    return res.status(403).json({ error: 'PROD_ONLY' });
  }
  next();
}
