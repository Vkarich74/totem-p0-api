// routes_system/opsExport.js
// SYSTEM: ops export (payouts)

import express from "express";

const router = express.Router();

/*
  Exports payout data for ops/accounting.
  v1 — MOCK IMPLEMENTATION (no DB yet)
*/

router.get("/export/payouts", (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({
      ok: false,
      error: "MISSING_DATE_RANGE",
    });
  }

  // MOCK export data
  return res.json({
    ok: true,
    range: { from, to },
    payouts: [
      {
        payout_id: 1,
        entity_type: "salon",
        entity_id: "1",
        amount_total: 1000,
        status: "settled",
      },
    ],
  });
});

export default router;
