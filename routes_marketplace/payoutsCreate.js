// routes_marketplace/payoutsCreate.js
// MARKETPLACE: create payout period

import express from "express";

const router = express.Router();

/*
  Creates payout period for entity (salon).
  v1 — MOCK IMPLEMENTATION (no DB yet)
*/

router.post("/create", (req, res) => {
  const { entity_type, entity_id, from, to } = req.body;

  if (!entity_type || !entity_id || !from || !to) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_PAYLOAD",
    });
  }

  // MOCK payout_id
  const payout_id = 1;

  return res.json({
    ok: true,
    payout_id,
    entity_type,
    entity_id,
    period: { from, to },
    status: "pending",
  });
});

export default router;
