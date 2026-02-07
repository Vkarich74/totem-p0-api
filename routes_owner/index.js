import express from 'express';
import db from '../db.js';
import { authOwner } from '../middleware/auth_owner.js';

import {
  inviteMaster,
  activateMaster,
  fireMaster
} from './master_salon.js';

const router = express.Router();

/**
 * OWNER LINK (NO authOwner)
 * Owner сам привязывает себя к салону
 *
 * Headers:
 *  Authorization: Bearer <owner_id>
 *
 * Body:
 *  { "salon_id": "s1" }
 */
router.post('/link', async (req, res) => {
  try {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'OWNER_TOKEN_REQUIRED' });
    }

    const owner_id = auth.replace('Bearer ', '').trim();
    const { salon_id } = req.body;

    if (!salon_id) {
      return res.status(400).json({ error: 'SALON_ID_REQUIRED' });
    }

    const sql =
      db.mode === 'POSTGRES'
        ? `
          INSERT INTO owner_salon (owner_id, salon_id, status)
          VALUES ($1, $2, 'active')
          ON CONFLICT (owner_id, salon_id) DO NOTHING
        `
        : `
          INSERT OR IGNORE INTO owner_salon (owner_id, salon_id, status)
          VALUES (?, ?, 'active')
        `;

    await db.run(sql, [owner_id, salon_id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[OWNER_LINK]', e);
    res.status(500).json({ error: 'OWNER_LINK_FAILED' });
  }
});

/**
 * Все остальные owner-операции — ТОЛЬКО после:
 * - активного салона (requireActiveSalon)
 * - ownership (authOwner)
 */
router.use(authOwner);

/**
 * READ: salons (owner scope)
 */
router.get('/salons', async (req, res) => {
  const sql =
    db.mode === 'POSTGRES'
      ? `
        SELECT s.slug, s.name
        FROM salons s
        JOIN owner_salon os ON os.salon_id = s.id
        WHERE os.owner_id = $1
          AND os.status = 'active'
        ORDER BY s.name
      `
      : `
        SELECT s.slug, s.name
        FROM salons s
        JOIN owner_salon os ON os.salon_id = s.id
        WHERE os.owner_id = ?
          AND os.status = 'active'
        ORDER BY s.name
      `;

  const rows = await db.all(sql, [req.owner_id]);
  res.json({ ok: true, salons: rows });
});

/**
 * MASTER ↔ SALON
 */
router.post('/master/invite', inviteMaster);
router.post('/master/activate', activateMaster);
router.post('/master/fire', fireMaster);

export default router;
