-- FIX master_salon types and constraints
BEGIN TRANSACTION;

-- Drop duplicate table if exists
DROP TABLE IF EXISTS salon_masters;

-- Rebuild master_salon with correct types
CREATE TABLE IF NOT EXISTS master_salon_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salon_id TEXT NOT NULL,
  master_id TEXT NOT NULL,
  status TEXT DEFAULT 'invited',
  invited_at TEXT,
  activated_at TEXT,
  fired_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (salon_id, master_id)
);

-- Migrate data
INSERT INTO master_salon_new (
  id, salon_id, master_id, status,
  invited_at, activated_at, fired_at,
  created_at, updated_at
)
SELECT
  id,
  CAST(salon_id AS TEXT),
  CAST(master_id AS TEXT),
  status,
  invited_at, activated_at, fired_at,
  created_at, updated_at
FROM master_salon;

DROP TABLE master_salon;
ALTER TABLE master_salon_new RENAME TO master_salon;

CREATE INDEX IF NOT EXISTS idx_master_salon_salon ON master_salon (salon_id);
CREATE INDEX IF NOT EXISTS idx_master_salon_master ON master_salon (master_id);

COMMIT;
