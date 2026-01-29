// routes_system/payoutsSettle.js
// SYSTEM: settle payout period

import express from "express";

const router = express.Router();

/*
  Finalizes payout period.
  v1 — MOCK IMPLEMENTATION (no DB yet)
*/

router.post("/:payout_id/settle", (req, res) => {
  const { payout_id } = req.params;

  if (!payout_id) {
    return res.status(400).json({
      ok: false,
      error: "MISSING_PAYOUT_ID",
    });
  }

  // MOCK settlement
  return res.json({
    ok: true,
    payout_id: Number(payout_id),
    status: "settled",
  });
});

export default router;
