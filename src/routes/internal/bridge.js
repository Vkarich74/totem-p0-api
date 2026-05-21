import express from "express";
import { requireRole } from "../../middleware/requireRole.js";
import { processOdooRegistrationBridge } from "../../services/bridge/odooRegistrationBridge.js";

const INTERNAL_BRIDGE_ROLES = ["system", "owner", "salon_admin"];

function buildSuccessStatus(resultStatus) {
  if (resultStatus === "failed") {
    return 400;
  }

  return 200;
}

export default function buildOdooBridgeRouter(pool) {
  const r = express.Router();

  r.post("/bridge/odoo/registration", requireRole(INTERNAL_BRIDGE_ROLES), async (req, res) => {
    try {
      const result = await processOdooRegistrationBridge(pool, req.body || {}, {
        actor: req.auth || req.identity || null,
      });

      return res.status(buildSuccessStatus(result?.status)).json(result);
    } catch (err) {
      console.error("ODOO_BRIDGE_ROUTE_ERROR", {
        code: err?.code || err?.message || "UNKNOWN",
        status: err?.status || null,
      });

      return res.status(500).json({
        ok: false,
        error: "ODOO_BRIDGE_INTERNAL_ERROR",
      });
    }
  });

  return r;
}
