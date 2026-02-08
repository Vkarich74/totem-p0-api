import express from 'express';
import db from '../db.js';
import requireOwner from '../middleware/requireOwner.js';
import requireMaster from '../middleware/requireMaster.js';

const router = express.Router();

/**
 * POST /calendar/reserve
 */
router.post(
  '/reserve',
  async (req, res, next) => {
    const actor = req.user;

    if (!actor) return res.status(403).json({ error: 'AUTH_REQUIRED' });

    if (actor.type === 'OWNER') return requireOwner()(req, res, next);
    if (actor.type === 'MASTER') return requireMaster()(req, res, next);

    return res.status(403).json({ error: 'FORBIDDEN' });
  },
  async (req, res) => {
    try {
      const { master_id, salon_id, start_at, end_at, request_id } = req.body;

      if (!salon_id) return res.status(400).json({ error: 'SALON_ID_REQUIRED' });
      if (!master_id || !start_at || !end_at || !request_id) {
        return res.status(400).json({ error: 'INVALID_INPUT' });
      }

      const existing = await db.get(
        db.mode === 'POSTGRES'
          ? 'SELECT id FROM calendar_slots WHERE request_id = $1'
          : 'SELECT id FROM calendar_slots WHERE request_id = ?',
        [request_id]
      );

      if (existing) return res.json({ ok: true });

      const insertSql =
        db.mode === 'POSTGRES'
          ? `
            INSERT INTO calendar_slots
              (master_id, salon_id, start_at, end_at, status, request_id)
            VALUES ($1,$2,$3,$4,'reserved',$5)
          `
          : `
            INSERT INTO calendar_slots
              (master_id, salon_id, start_at, end_at, status, request_id)
            VALUES (?,?,?,?, 'reserved', ?)
          `;

      await db.run(insertSql, [
        master_id,
        salon_id,
        start_at,
        end_at,
        request_id
      ]);

      res.json({ ok: true });
    } catch (e) {
      if (String(e).includes('calendar_slots_no_overlap')) {
        return res.status(409).json({ error: 'CALENDAR_CONFLICT' });
      }
      res.status(500).json({ error: 'CALENDAR_RESERVE_FAILED' });
    }
  }
);

/**
 * GET /calendar/master/:master_id
 */
router.get(
  '/master/:master_id',
  async (req, res, next) => {
    const actor = req.user;

    if (!actor) return res.status(403).json({ error: 'AUTH_REQUIRED' });

    if (actor.type === 'OWNER') return requireOwner()(req, res, next);
    if (actor.type === 'MASTER') return requireMaster()(req, res, next);

    return res.status(403).json({ error: 'FORBIDDEN' });
  },
  async (req, res) => {
    try {
      const master_id = req.params.master_id;
      const salon_id = req.query.salon_id;

      if (!salon_id) {
        return res.status(400).json({ error: 'SALON_ID_REQUIRED' });
      }

      const sql =
        db.mode === 'POSTGRES'
          ? `
            SELECT id, master_id, salon_id, start_at, end_at, status
            FROM calendar_slots
            WHERE master_id = $1
              AND salon_id = $2
            ORDER BY start_at
          `
          : `
            SELECT id, master_id, salon_id, start_at, end_at, status
            FROM calendar_slots
            WHERE master_id = ?
              AND salon_id = ?
            ORDER BY start_at
          `;

      const rows = await db.all(sql, [master_id, salon_id]);
      res.json({ ok: true, slots: rows });
    } catch (e) {
      res.status(500).json({ error: 'CALENDAR_GET_FAILED' });
    }
  }
);

export default router;
