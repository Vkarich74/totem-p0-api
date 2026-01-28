import { db } from '../db/index.js';
import { isDuplicateAlert } from './alertsDedup.js';

export function createAlert({
  alert_type,
  entity_type,
  entity_id,
  severity,
  message,
  meta = null,
  dedup_ttl_min = 60
}) {
  // дедуп (логический)
  if (
    dedup_ttl_min &&
    isDuplicateAlert({
      alert_type,
      entity_type,
      entity_id,
      ttlMinutes: dedup_ttl_min
    })
  ) {
    return; // тихо выходим, без побочных эффектов
  }

  db.prepare(`
    INSERT INTO marketplace_alerts (
      alert_type,
      entity_type,
      entity_id,
      severity,
      message,
      meta_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    alert_type,
    entity_type,
    String(entity_id),
    severity,
    message,
    meta ? JSON.stringify(meta) : null
  );
}
