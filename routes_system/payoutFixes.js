import express from "express";
import { db } from "../db/index.js";

const router = express.Router();

/**
 * POST /system/payouts/:id/fix_zero_net_paid
 *
 * Policy (STRICT, SCHEMA-AWARE):
 * - payouts.status ∈ ('pending','paid')
 * - If status='paid' AND net_amount=0
 *   → revert to 'pending'
 *   → paid_at = NULL
 *
 * No recalculation. No silent correction.
 */
router.post("/payouts/:id/fix_zero_net_paid", (req, res) => {
  if (req.headers["x-actor-type"] !== "system") {
    return res.status(403).json({ error: "SYSTEM_ONLY" });
  }

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "INVALID_ID" });
  }

  const payout = db.prepare("SELECT * FROM payouts WHERE id = ?").get(id);
  if (!payout) {
    return res.status(404).json({ error: "NOT_FOUND" });
  }

  if (payout.status !== "paid" || Number(payout.net_amount) !== 0) {
    return res.status(409).json({
      error: "NO_FIX_NEEDED",
      status: payout.status,
      net_amount: payout.net_amount,
    });
  }

  db.prepare(`
    UPDATE payouts
    SET status = 'pending',
        paid_at = NULL
    WHERE id = ?
  `).run(id);

  const updated = db.prepare("SELECT * FROM payouts WHERE id = ?").get(id);

  return res.json({
    ok: true,
    action: "REVERT_PAID_TO_PENDING_ZERO_NET",
    before: {
      id: payout.id,
      status: payout.status,
      net_amount: payout.net_amount,
      paid_at: payout.paid_at,
    },
    after: {
      id: updated.id,
      status: updated.status,
      net_amount: updated.net_amount,
      paid_at: updated.paid_at,
    },
  });
});

export default router;
