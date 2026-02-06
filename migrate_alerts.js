import Database from 'better-sqlite3';

const db = new Database('totem.db');

db.prepare(`
CREATE TABLE IF NOT EXISTS marketplace_alerts (
  alert_id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT NOT NULL
)
`).run();

db.prepare(`
CREATE INDEX IF NOT EXISTS idx_marketplace_alerts_type_time
ON marketplace_alerts(alert_type, created_at)
`).run();

console.log('ALERTS MIGRATION OK');
