import express from 'express';
import db from '../db.js';

const router = express.Router();

/**
 * GET /owner/reports/salons
 * Returns salons owned by current owner
 */
router.get('/salons', async (req, res) => {
  try {
    const sql =
      db.mode === 'POSTGRES'
        ? `
          SELECT s.id, s.slug, s.name, s.status
          FROM salons s
          JOIN owner_salon os ON os.salon_id = s.id
          WHERE os.owner_id = $1
            AND os.status = 'active'
          ORDER BY s.name
        `
        : `
          SELECT s.id, s.slug, s.name, s.status
          FROM salons s
          JOIN owner_salon os ON os.salon_id = s.id
          WHERE os.owner_id = ?
            AND os.status = 'active'
          ORDER BY s.name
        `;

    const rows = await db.all(sql, [req.owner_id]);
    res.json({ ok: true, items: rows });
  } catch (e) {
    console.error('[OWNER_REPORT_SALONS]', e);
    res.status(500).json({ error: 'REPORT_FAILED' });
  }
});

/**
 * GET /owner/reports/masters
 * Returns masters grouped by salon
 */
router.get('/masters', async (req, res) => {
  try {
    const sql =
      db.mode === 'POSTGRES'
        ? `
          SELECT
            s.id AS salon_id,
            s.slug AS salon_slug,
            m.id AS master_id,
            m.name AS master_name,
            os.status
          FROM owner_salon os
          JOIN salons s ON s.id = os.salon_id
          JOIN masters m ON m.salon_id = s.id
          WHERE os.owner_id = $1
            AND os.status = 'active'
          ORDER BY s.slug, m.name
        `
        : `
          SELECT
            s.id AS salon_id,
            s.slug AS salon_slug,
            m.id AS master_id,
            m.name AS master_name,
            os.status
          FROM owner_salon os
          JOIN salons s ON s.id = os.salon_id
          JOIN masters m ON m.salon_id = s.id
          WHERE os.owner_id = ?
            AND os.status = 'active'
          ORDER BY s.slug, m.name
        `;

    const rows = await db.all(sql, [req.owner_id]);
    res.json({ ok: true, items: rows });
  } catch (e) {
    console.error('[OWNER_REPORT_MASTERS]', e);
    res.status(500).json({ error: 'REPORT_FAILED' });
  }
});

export default router;
