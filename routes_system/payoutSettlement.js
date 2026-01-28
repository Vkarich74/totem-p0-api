import express from "express";
import { db } from "../db/index.js";

const router = express.Router();

/**
 * POST /system/payouts/:id/settle
 *
 * Settlement locking rules:
 * - system-only
 * - payout.status MUST be 'pending'
 * - paid_at MUST be NULL
 * - transition allowed only once
 */
router.post("/payouts/:id/settle", (req, res) => {
  if (req.headers["x-actor-type"] !== "system") {
    return res.status(403).json({ error: "SYSTEM_ONLY" });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "INVALID_ID" });
  }

  const payout = db.prepare(`
    SELECT id, status, paid_at, net_amount, currency
    FROM payouts
    WHERE id = ?
  `).get(id);

  if (!payout) {
    return res.status(404).json({ error: "NOT_FOUND" });
  }

  if (payout.status !== "pending") {
    return res.status(409).json({
      error: "INVALID_STATUS",
      status: payout.status,
    });
  }

  if (payout.paid_at !== null) {
    return res.status(409).json({
      error: "ALREADY_SETTLED",
      paid_at: payout.paid_at,
    });
  }

  if (Number(payout.net_amount) < 0) {
    return res.status(422).json({
      error: "NEGATIVE_NET_AMOUNT",
      net_amount: payout.net_amount,
    });
  }

  // Atomic settle
  const result = db.prepare(`
    UPDATE payouts
    SET status = 'paid',
        paid_at = datetime('now')
    WHERE id = ?
      AND status = 'pending'
      AND paid_at IS NULL
  `).run(id);

  if (result.changes !== 1) {
    return res.status(409).json({
      error: "SETTLEMENT_RACE_DETECTED",
    });
  }

  const updated = db.prepare(`
    SELECT id, status, paid_at, net_amount, currency
    FROM payouts
    WHERE id = ?
  `).get(id);

  return res.json({
    ok: true,
    action: "PAYOUT_SETTLED",
    payout: updated,
  });
});

export default router;
