import express from 'express';
import { db } from '../db/index.js';

const router = express.Router();

/**
 * GET /system/alerts
 * ?type=webhook_failed
 * ?severity=critical
 * ?limit=50
 */
router.get('/alerts', (req, res) => {
  const { type, severity } = req.query;
  const limit = Math.min(Number(req.query.limit || 50), 200);

  const where = [];
  const params = [];

  if (type) {
    where.push('alert_type = ?');
    params.push(type);
  }

  if (severity) {
    where.push('severity = ?');
    params.push(severity);
  }

  const sql = `
    SELECT alert_id, alert_type, entity_type, entity_id, severity, message, meta_json, created_at
    FROM marketplace_alerts
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY alert_id DESC
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...params, limit);
  res.json({ ok: true, alerts: rows });
});

export default router;
