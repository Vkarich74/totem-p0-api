import express from "express";

const router = express.Router();

/**
 * SYSTEM — Monetization rules (B17)
 * Read-only, source of truth for SDK / partners / ops
 *
 * GET /system/monetization/rules
 */
router.get("/monetization/rules", (req, res) => {
  if (req.headers["x-actor-type"] !== "system") {
    return res.status(403).json({ error: "SYSTEM_ONLY" });
  }

  res.json({
    status: "active",
    scope: "marketplace",
    rules: {
      money: {
        price: "number >= 0 (if present)",
        amount: "number >= 0 (if present)",
      },
      commission: {
        commission_pct: "integer 0..100 (if present)",
        invariant: "price * commission_pct / 100 <= price",
      },
      currency: {
        format: "ISO-4217 (3 letters)",
        note: "Optional today, but strongly recommended",
      },
      payouts: {
        entity_type: ["salon", "master"],
        period: "from <= to (YYYY-MM-DD)",
      },
      philosophy: [
        "Non-breaking: fields are not required, only validated when present",
        "Fail-fast on impossible monetary states",
        "Hints preferred over silent correction",
      ],
    },
  });
});

export default router;
