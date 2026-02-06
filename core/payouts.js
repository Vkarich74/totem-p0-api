// core/payouts.js (ESM)
// Canonical payouts core — P1 stable (NULL-safe)

import { getSalonReport, getMasterReport } from "./reports.js";
import {
  getSettlementRule,
  assertPeriodMature,
  assertRefundPolicy
} from "./settlement.js";

/* =======================
   helpers
======================= */

function assertSystem(actorType) {
  if (actorType !== "system") {
    const e = new Error("Only system can execute payouts");
    e.code = "FORBIDDEN_PAYOUT";
    throw e;
  }
}

function validatePeriod(from, to) {
  if (!from || !to) {
    const e = new Error("period_from and period_to are required");
    e.code = "PERIOD_REQUIRED";
    throw e;
  }
  if (from > to) {
    const e = new Error("Invalid period");
    e.code = "INVALID_PERIOD";
    throw e;
  }
}

function getExistingPayout(db, entityType, entityId, from, to) {
  return db.prepare(`
    SELECT 1
    FROM payouts
    WHERE entity_type = ?
      AND entity_id = ?
      AND period_from = ?
      AND period_to = ?
  `).get(entityType, String(entityId), from, to);
}

/* =======================
   ledger (refund-safe)
======================= */

function buildLedger(db, entityType, entityId, from, to) {
  return db.prepare(`
    SELECT
      b.id AS booking_id,
      CASE
        WHEN p.status = 'succeeded' THEN p.amount
        ELSE 0
      END AS amount,
      CASE
        WHEN p.status = 'succeeded' THEN p.amount
        ELSE 0
      END AS net
    FROM booking_payments p
    LEFT JOIN bookings b ON b.id = p.booking_id
    WHERE b.id IS NOT NULL
      AND b.${entityType}_id = ?
      AND b.date >= ?
      AND b.date <= ?
      AND p.status IN ('succeeded','refunded','chargeback')
  `).all(String(entityId), from, to);
}

/* =======================
   exports
======================= */

export function previewPayout(db, entityType, entityId, { from, to }) {
  validatePeriod(from, to);

  if (getExistingPayout(db, entityType, entityId, from, to)) {
    const e = new Error("Payout already exists");
    e.code = "PAYOUT_ALREADY_EXISTS";
    throw e;
  }

  const report =
    entityType === "salon"
      ? getSalonReport(db, entityId, { from, to })
      : getMasterReport(db, entityId, { from, to });

  return {
    entity_type: entityType,
    entity_id: String(entityId),
    period: { from, to },
    total_paid: report.total_paid ?? 0,
    total_commission: report.total_commission ?? 0,
    net_amount: report.net_to_salon ?? 0,
    currency: report.currency || "USD"
  };
}

export function createPayout(db, entityType, entityId, { from, to }) {
  validatePeriod(from, to);

  if (getExistingPayout(db, entityType, entityId, from, to)) {
    const e = new Error("Payout already exists");
    e.code = "PAYOUT_ALREADY_EXISTS";
    throw e;
  }

  const rule = getSettlementRule(db, entityType, entityId);
  assertPeriodMature(rule, from, to);
  assertRefundPolicy(rule);

  const report =
    entityType === "salon"
      ? getSalonReport(db, entityId, { from, to })
      : getMasterReport(db, entityId, { from, to });

  // 🔒 NULL-safe normalization (CRITICAL FIX)
  const totalPaid = report.total_paid ?? 0;
  const totalCommission = report.total_commission ?? 0;
  const netAmount = report.net_to_salon ?? 0;
  const currency = report.currency || "USD";

  const ledger = buildLedger(db, entityType, entityId, from, to);

  const tx = db.transaction(() => {
    const res = db.prepare(`
      INSERT INTO payouts (
        entity_type,
        entity_id,
        period_from,
        period_to,
        total_paid,
        total_commission,
        net_amount,
        currency,
        status
      ) VALUES (?,?,?,?,?,?,?,?, 'pending')
    `).run(
      entityType,
      String(entityId),
      from,
      to,
      totalPaid,
      totalCommission,
      netAmount,
      currency
    );

    const payoutId = res.lastInsertRowid;

    const ins = db.prepare(`
      INSERT INTO payout_items (
        payout_id,
        booking_id,
        amount,
        net
      ) VALUES (?,?,?,?)
    `);

    for (const r of ledger) {
      ins.run(payoutId, r.booking_id, r.amount ?? 0, r.net ?? 0);
    }

    return payoutId;
  });

  const payoutId = tx();

  return {
    payout_id: payoutId,
    entity_type: entityType,
    entity_id: String(entityId),
    period: { from, to },
    status: "pending"
  };
}

export function markPayoutPaid(db, payoutId, actorType) {
  assertSystem(actorType);

  const p = db.prepare(`SELECT * FROM payouts WHERE id = ?`).get(payoutId);
  if (!p) {
    const e = new Error("Not found");
    e.code = "PAYOUT_NOT_FOUND";
    throw e;
  }

  if (p.status === "paid") {
    const e = new Error("Already paid");
    e.code = "PAYOUT_ALREADY_PAID";
    throw e;
  }

  db.prepare(`
    UPDATE payouts
    SET status='paid', paid_at=datetime('now')
    WHERE id=?
  `).run(payoutId);

  return { payout_id: payoutId, status: "paid" };
}
