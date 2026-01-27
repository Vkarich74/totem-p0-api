import { db } from '../db/index.js';
import { createAlert } from '../services/alerts.js';

export function detectWebhookFailures() {
  const rows = db.prepare(`
    SELECT *
    FROM marketplace_webhook_deliveries
    WHERE status = 'failed'
  `).all();

  for (const row of rows) {
    createAlert({
      alert_type: 'webhook_failed',
      entity_type: 'webhook_delivery',
      entity_id: row.delivery_id ?? row.id ?? 'unknown',
      severity: 'high',
      message: 'Webhook delivery failed',
      meta: row
    });
  }
}
