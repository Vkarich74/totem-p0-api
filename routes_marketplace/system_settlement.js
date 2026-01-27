import express from "express";
import { db } from "../db/index.js";

const router = express.Router();

/**
 * SYSTEM — RUN SETTLEMENT
 * POST /system/settlement/run
 * Query:
 *  - dry_run=1
 */
router.post("/settlement/run", (req, res) => {
  try {
    // SYSTEM GUARD
    if (req.headers["x-actor-type"] !== "system") {
      return res.status(403).json({ error: "forbidden" });
    }

    if (process.env.SYSTEM_TOKEN) {
      if (req.headers["x-system-token"] !== process.env.SYSTEM_TOKEN) {
        return res.status(403).json({ error: "invalid_system_token" });
      }
    }

    const dryRun = req.query.dry_run === "1";

    const pending = db.prepare(`
      SELECT id
      FROM payouts
      WHERE status = 'pending'
    `).all();

    if (dryRun) {
      return res.json({
        ok: true,
        dry_run: true,
        payouts_scanned: pending.length,
        payouts_to_settle: pending.map(p => p.id)
      });
    }

    const tx = db.transaction(() => {
      for (const p of pending) {
        db.prepare(`
          UPDATE payouts
          SET status = 'paid', paid_at = datetime('now')
          WHERE id = ?
        `).run(p.id);
      }
    });

    tx();

    return res.json({
      ok: true,
      payouts_settled: pending.length
    });
  } catch (e) {
    console.error("SYSTEM_SETTLEMENT_ERROR", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
