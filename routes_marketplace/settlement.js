// routes_marketplace/settlement.js (ESM)
// System-only API for settlement rules

import {
  listSettlementRules,
  getSettlementRuleByScope,
  upsertSettlementRule
} from "../core/settlementAdmin.js";

function assertSystem(req) {
  const actorType = req.headers["x-actor-type"];
  if (actorType !== "system") {
    const e = new Error("System only");
    e.code = "FORBIDDEN_SYSTEM_ONLY";
    throw e;
  }
}

export function registerSettlementRoutes(app, db) {

  /**
   * LIST RULES (system only)
   * GET /marketplace/settlement-rules
   */
  app.get("/marketplace/settlement-rules", (req, res) => {
    try {
      assertSystem(req);
      const rules = listSettlementRules(db);
      res.json({ ok: true, rules });
    } catch (err) {
      handleSettlementError(err, res);
    }
  });

  /**
   * GET RULE BY SCOPE (system only)
   * GET /marketplace/settlement-rules/:entity_type
   * GET /marketplace/settlement-rules/:entity_type/:entity_id
   */
  app.get("/marketplace/settlement-rules/:entity_type/:entity_id?", (req, res) => {
    try {
      assertSystem(req);

      const { entity_type, entity_id } = req.params;
      const rule = getSettlementRuleByScope(db, entity_type, entity_id);

      if (!rule) return res.status(404).json({ error: "RULE_NOT_FOUND" });
      res.json({ ok: true, rule });

    } catch (err) {
      handleSettlementError(err, res);
    }
  });

  /**
   * UPSERT RULE (system only)
   * POST /marketplace/settlement-rules
   * Headers: x-actor-type: system
   * Body:
   * {
   *   "entity_type": "global" | "salon" | "master",
   *   "entity_id": "1" (required for salon/master),
   *   "lock_days": 14,
   *   "allow_refunds": true|false
   * }
   */
  app.post("/marketplace/settlement-rules", (req, res) => {
    try {
      assertSystem(req);

      const { entity_type, entity_id, lock_days, allow_refunds } = req.body || {};
      const rule = upsertSettlementRule(db, { entity_type, entity_id, lock_days, allow_refunds });

      res.json({ ok: true, rule });

    } catch (err) {
      handleSettlementError(err, res);
    }
  });
}

function handleSettlementError(err, res) {
  const code = err.code || "SETTLEMENT_ERROR";

  switch (code) {
    case "FORBIDDEN_SYSTEM_ONLY":
      return res.status(403).json({ error: code });

    case "INVALID_ENTITY_TYPE":
    case "ENTITY_ID_REQUIRED":
    case "INVALID_LOCK_DAYS":
      return res.status(400).json({ error: code });

    default:
      console.error("[SETTLEMENT_ERROR]", err);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
}
