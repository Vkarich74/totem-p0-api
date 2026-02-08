import db from '../db.js';

export default function requireOwner() {
  return async function (req, res, next) {
    try {
      const actor = req.user;

      if (!actor || actor.type !== 'OWNER') {
        return res.status(403).json({ error: 'OWNER_ONLY' });
      }

      const salon_id = req.body.salon_id || req.query.salon_id;
      if (!salon_id) {
        return res.status(400).json({ error: 'SALON_ID_REQUIRED' });
      }

      const sql =
        db.mode === 'POSTGRES'
          ? `
            SELECT 1
            FROM owner_salon
            WHERE owner_id = $1
              AND salon_id = $2
            LIMIT 1
          `
          : `
            SELECT 1
            FROM owner_salon
            WHERE owner_id = ?
              AND salon_id = ?
            LIMIT 1
          `;

      const row = await db.get(sql, [actor.id, salon_id]);

      if (!row) {
        return res.status(403).json({ error: 'OWNER_SALON_FORBIDDEN' });
      }

      next();
    } catch (e) {
      console.error('[REQUIRE_OWNER]', e);
      res.status(500).json({ error: 'PERMISSION_CHECK_FAILED' });
    }
  };
}
