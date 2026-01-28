import express from "express";
import { checkPayoutConsistency } from "../jobs/payoutConsistencyCheck.js";

const router = express.Router();

/**
 * GET /system/payouts/consistency
 * system-only, read-only
 */
router.get("/payouts/consistency", (req, res) => {
  if (req.headers["x-actor-type"] !== "system") {
    return res.status(403).json({ error: "SYSTEM_ONLY" });
  }

  const report = checkPayoutConsistency();

  res.json({
    status: report.ok ? "ok" : "error",
    checked: report.checked,
    errors: report.errors,
  });
});

export default router;
