// core/settlement.js (ESM)
// Settlement rules resolver + maturity checks (lock windows & refund-safe)

function daysBetweenUTC(a, b) {
  // a, b are YYYY-MM-DD (UTC)
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  const diffMs = db.getTime() - da.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function todayUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Resolve active settlement rule with precedence:
 * 1) entity-specific (salon/master)
 * 2) global
 */
export function getSettlementRule(db, entityType, entityId) {
  if (!entityType) {
    const e = new Error("entityType required");
    e.code = "ENTITY_TYPE_REQUIRED";
    throw e;
  }

  // 1) entity-specific
  if (entityType === "salon" || entityType === "master") {
    const specific = db.prepare(`
      SELECT *
      FROM settlement_rules
      WHERE entity_type = ?
        AND entity_id = ?
      LIMIT 1
    `).get(entityType, String(entityId));

    if (specific) return normalizeRule(specific);
  }

  // 2) global
  const globalRule = db.prepare(`
    SELECT *
    FROM settlement_rules
    WHERE entity_type = 'global'
    LIMIT 1
  `).get();

  if (!globalRule) {
    const e = new Error("Global settlement rule not found");
    e.code = "SETTLEMENT_RULE_MISSING";
    throw e;
  }

  return normalizeRule(globalRule);
}

function normalizeRule(r) {
  return {
    id: r.id,
    entity_type: r.entity_type,
    entity_id: r.entity_id ?? null,
    lock_days: Number(r.lock_days),
    allow_refunds: Boolean(r.allow_refunds),
    created_at: r.created_at
  };
}

/**
 * Check if payout period is mature (lock window passed)
 * Rule:
 * - maturity_date = period_to + lock_days
 * - today >= maturity_date => mature
 */
export function assertPeriodMature(rule, periodFrom, periodTo, today = todayUTC()) {
  if (!periodFrom || !periodTo) {
    const e = new Error("Period required");
    e.code = "PERIOD_REQUIRED";
    throw e;
  }

  const lockDays = Number(rule.lock_days);
  if (!Number.isFinite(lockDays) || lockDays < 0) {
    const e = new Error("Invalid lock_days");
    e.code = "INVALID_LOCK_DAYS";
    throw e;
  }

  const maturityOffset = daysBetweenUTC(periodTo, today);
  if (maturityOffset < lockDays) {
    const e = new Error("Settlement period not mature");
    e.code = "SETTLEMENT_LOCK_ACTIVE";
    e.meta = {
      lock_days: lockDays,
      days_since_period_end: maturityOffset,
      days_remaining: lockDays - maturityOffset
    };
    throw e;
  }

  return true;
}

/**
 * Refund-safe check (soft gate)
 * If refunds are NOT allowed, payout must be blocked unless explicitly overridden.
 */
export function assertRefundPolicy(rule) {
  if (!rule.allow_refunds) {
    const e = new Error("Refunds are not allowed for this settlement");
    e.code = "REFUNDS_DISABLED";
    throw e;
  }
  return true;
}
