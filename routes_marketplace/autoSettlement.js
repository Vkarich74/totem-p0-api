// routes_marketplace/autoSettlement.js (ESM)
// System-only endpoint to run auto-settlement (dry-run / execute)

import { runAutoSettlement } from "../jobs/autoSettlement.js";

function assertSystem(req) {
  if (req.headers["x-actor-type"] !== "system") {
    const e = new Error("System only");
    e.code = "FORBIDDEN_SYSTEM_ONLY";
    throw e;
  }
}

export function registerAutoSettlementRoutes(app) {

  /**
   * POST /marketplace/auto-settlement
   * Headers: x-actor-type: system
   * Body: { "execute": true|false }
   */
  app.post("/marketplace/auto-settlement", (req, res) => {
    try {
      assertSystem(req);
      const execute = Boolean(req.body?.execute);
      const result = runAutoSettlement({ execute });
      res.json({ ok: true, result });
    } catch (err) {
      const code = err.code || "AUTO_SETTLEMENT_ERROR";
      if (code === "FORBIDDEN_SYSTEM_ONLY") {
        return res.status(403).json({ error: code });
      }
      console.error("[AUTO_SETTLEMENT_ERROR]", err);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });
}
