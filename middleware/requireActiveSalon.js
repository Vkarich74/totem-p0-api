import db from '../db.js';

export default async function requireActiveSalon(req, res, next) {
  const salon_id =
    req.headers['x-salon-id'] ||
    req.body?.salon_id ||
    req.params?.salon_id;

  if (!salon_id) {
    return res.status(400).json({ error: 'SALON_ID_REQUIRED' });
  }

  const sql =
    db.mode === 'POSTGRES'
      ? `SELECT 1 FROM salon_subscriptions
         WHERE salon_id=$1 AND active_until >= NOW()`
      : `SELECT 1 FROM salon_subscriptions
         WHERE salon_id=? AND active_until >= datetime('now')`;

  const row = await db.get(sql, [String(salon_id)]);
  if (!row) {
    return res.status(403).json({ error: 'SALON_NOT_ACTIVE' });
  }

  next();
}
