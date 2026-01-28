import { db } from '../db/index.js';

export function isDuplicateAlert({
  alert_type,
  entity_type,
  entity_id,
  ttlMinutes
}) {
  const since = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();

  const row = db.prepare(`
    SELECT alert_id
    FROM marketplace_alerts
    WHERE alert_type = ?
      AND entity_type = ?
      AND entity_id = ?
      AND created_at >= ?
    ORDER BY alert_id DESC
    LIMIT 1
  `).get(alert_type, entity_type, String(entity_id), since);

  return !!row;
}
