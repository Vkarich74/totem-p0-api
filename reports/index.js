import express from 'express';
import db from '../db.js';

const router = express.Router();

/**
 * Activation guard (READ-ONLY allowed)
 * Uses subscription table.
 * Context: salon_id from:
 * - X-Salon-Id header
 * - req.params.salon_id
 * - req.query.salon_id
 */
async function requireActiveSalon(req, res, next) {
  try {
    const salon_id =
      req.headers['x-salon-id'] ||
      req.params?.salon_id ||
      req.query?.salon_id;

    if (!salon_id) return res.status(400).json({ error: 'SALON_ID_REQUIRED' });

    const sql =
      db.mode === 'POSTGRES'
        ? `SELECT 1 FROM salon_subscriptions WHERE salon_id=$1 AND active_until >= NOW()`
        : `SELECT 1 FROM salon_subscriptions WHERE salon_id=? AND active_until >= datetime('now')`;

    const row = await db.get(sql, [String(salon_id)]);
    if (!row) return res.status(403).json({ error: 'SALON_NOT_ACTIVE' });

    req._reports_salon_id = String(salon_id);
    next();
  } catch (e) {
    console.error('[REPORTS_GUARD]', e);
    res.status(500).json({ error: 'REPORTS_GUARD_FAILED' });
  }
}

/**
 * GET /reports/calendar/master/:master_id
 * Requires active salon via X-Salon-Id (caller context)
 */
router.get('/calendar/master/:master_id', requireActiveSalon, async (req, res) => {
  try {
    const master_id = Number(req.params.master_id);

    const sql =
      db.mode === 'POSTGRES'
        ? `
          SELECT salon_id, start_at, end_at, status
          FROM calendar_slots
          WHERE master_id = $1
          ORDER BY start_at
        `
        : `
          SELECT salon_id, start_at, end_at, status
          FROM calendar_slots
          WHERE master_id = ?
          ORDER BY start_at
        `;

    const rows = await db.all(sql, [master_id]);
    res.json({ ok: true, items: rows });
  } catch (e) {
    console.error('[REPORT_CALENDAR_MASTER]', e);
    res.status(500).json({ error: 'REPORT_FAILED' });
  }
});

/**
 * GET /reports/finance/salon/:salon_id
 * Requires active salon for the same salon_id
 */
router.get('/finance/salon/:salon_id', requireActiveSalon, async (req, res) => {
  try {
    const salon_id = String(req.params.salon_id);

    // Ensure caller context matches the requested salon_id (hard rule)
    if (req._reports_salon_id !== salon_id) {
      return res.status(403).json({ error: 'SALON_CONTEXT_MISMATCH' });
    }

    const listSql =
      db.mode === 'POSTGRES'
        ? `SELECT type, status, amount, currency, created_at FROM finance_events WHERE salon_id=$1 ORDER BY created_at DESC`
        : `SELECT type, status, amount, currency, created_at FROM finance_events WHERE salon_id=? ORDER BY created_at DESC`;

    const items = await db.all(listSql, [salon_id]);

    // Aggregates (safe in app layer)
    let cnt = 0;
    let sum = 0;
    const by_type = {};
    const by_status = {};

    for (const it of items) {
      cnt += 1;
      const a = Number(it.amount || 0);
      sum += a;

      const t = String(it.type || 'unknown');
      const s = String(it.status || 'unknown');

      by_type[t] = (by_type[t] || 0) + a;
      by_status[s] = (by_status[s] || 0) + a;
    }

    res.json({
      ok: true,
      salon_id,
      totals: { cnt, sum, currency: 'KGS' },
      by_type,
      by_status,
      items
    });
  } catch (e) {
    console.error('[REPORT_FINANCE_SALON]', e);
    res.status(500).json({ error: 'REPORT_FAILED' });
  }
});

/**
 * GET /reports/bookings/salon/:salon_id
 * Requires active salon for the same salon_id
 */
router.get('/bookings/salon/:salon_id', requireActiveSalon, async (req, res) => {
  try {
    const salon_id = String(req.params.salon_id);

    if (req._reports_salon_id !== salon_id) {
      return res.status(403).json({ error: 'SALON_CONTEXT_MISMATCH' });
    }

    const sql =
      db.mode === 'POSTGRES'
        ? `
          SELECT id, salon_id, salon_slug, master_id, start_at, end_at, status, request_id, created_at
          FROM bookings
          WHERE salon_id = $1
          ORDER BY start_at DESC
        `
        : `
          SELECT id, salon_id, salon_slug, master_id, start_at, end_at, status, request_id, created_at
          FROM bookings
          WHERE salon_id = ?
          ORDER BY start_at DESC
        `;

    const rows = await db.all(sql, [Number(salon_id)]);
    res.json({ ok: true, salon_id, items: rows });
  } catch (e) {
    console.error('[REPORT_BOOKINGS_SALON]', e);
    res.status(500).json({ error: 'REPORT_FAILED' });
  }
});

export default router;
