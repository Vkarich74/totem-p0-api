// core/settlementAdmin.js (ESM)
// Admin operations for settlement rules (system-only via routes layer)

function normalizeScope(entityType, entityId) {
  const t = String(entityType || "").trim();

  if (!["global", "salon", "master"].includes(t)) {
    const e = new Error("Invalid entity_type");
    e.code = "INVALID_ENTITY_TYPE";
    throw e;
  }

  if (t === "global") {
    return { entity_type: "global", entity_id: null };
  }

  const id = String(entityId || "").trim();
  if (!id) {
    const e = new Error("entity_id is required for salon/master");
    e.code = "ENTITY_ID_REQUIRED";
    throw e;
  }

  return { entity_type: t, entity_id: id };
}

function normalizeLockDays(lockDays) {
  const n = Number(lockDays);
  if (!Number.isInteger(n) || n < 0 || n > 365) {
    const e = new Error("lock_days must be integer 0..365");
    e.code = "INVALID_LOCK_DAYS";
    throw e;
  }
  return n;
}

function normalizeAllowRefunds(v) {
  if (v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true") return 1;
  if (v === false || v === 0 || v === "0" || String(v).toLowerCase() === "false") return 0;
  // default if omitted
  return 1;
}

export function listSettlementRules(db) {
  const rows = db.prepare(`
    SELECT id, entity_type, entity_id, lock_days, allow_refunds, created_at
    FROM settlement_rules
    ORDER BY
      CASE entity_type
        WHEN 'global' THEN 0
        WHEN 'salon' THEN 1
        WHEN 'master' THEN 2
        ELSE 9
      END,
      COALESCE(entity_id, '')
  `).all();

  return rows.map(r => ({
    id: r.id,
    entity_type: r.entity_type,
    entity_id: r.entity_id ?? null,
    lock_days: Number(r.lock_days),
    allow_refunds: Boolean(r.allow_refunds),
    created_at: r.created_at
  }));
}

export function getSettlementRuleByScope(db, entityType, entityId) {
  const scope = normalizeScope(entityType, entityId);

  const row = db.prepare(`
    SELECT id, entity_type, entity_id, lock_days, allow_refunds, created_at
    FROM settlement_rules
    WHERE entity_type = ?
      AND (
        (? IS NULL AND entity_id IS NULL)
        OR entity_id = ?
      )
    LIMIT 1
  `).get(scope.entity_type, scope.entity_id, scope.entity_id);

  if (!row) return null;

  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id ?? null,
    lock_days: Number(row.lock_days),
    allow_refunds: Boolean(row.allow_refunds),
    created_at: row.created_at
  };
}

/**
 * UPSERT (implemented as delete+insert for SQLite simplicity)
 * Scope:
 *  - global: entity_type='global', entity_id NULL
 *  - salon/master: entity_type in ('salon','master'), entity_id required
 */
export function upsertSettlementRule(db, { entity_type, entity_id, lock_days, allow_refunds }) {
  const scope = normalizeScope(entity_type, entity_id);
  const lockDays = normalizeLockDays(lock_days);
  const allowRefunds = normalizeAllowRefunds(allow_refunds);

  const tx = db.transaction(() => {
    // delete existing for same scope
    db.prepare(`
      DELETE FROM settlement_rules
      WHERE entity_type = ?
        AND (
          (? IS NULL AND entity_id IS NULL)
          OR entity_id = ?
        )
    `).run(scope.entity_type, scope.entity_id, scope.entity_id);

    // insert new
    const result = db.prepare(`
      INSERT INTO settlement_rules (entity_type, entity_id, lock_days, allow_refunds)
      VALUES (?,?,?,?)
    `).run(scope.entity_type, scope.entity_id, lockDays, allowRefunds);

    const id = result.lastInsertRowid;

    return db.prepare(`
      SELECT id, entity_type, entity_id, lock_days, allow_refunds, created_at
      FROM settlement_rules
      WHERE id = ?
    `).get(id);
  });

  const row = tx();

  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id ?? null,
    lock_days: Number(row.lock_days),
    allow_refunds: Boolean(row.allow_refunds),
    created_at: row.created_at
  };
}
