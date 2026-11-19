// US SERVICE TAX / TAX-02: authenticated salon/master settings only.
// Mounted under /internal, after resolveAuth. No Stripe or payment writes.
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  readUsOwnerServiceTax,
  saveUsOwnerServiceTax,
  taxSettingsErrorResponse,
} from "../services/usServiceTaxSettings.service.js";

export function buildUsServiceTaxSettingsRouter(pool) {
  if (!pool || typeof pool.connect !== "function") {
    throw new Error("US_TAX_SETTINGS_DB_REQUIRED");
  }
  const router = express.Router();
  const routeGuards = [requireAuth];
  routeGuards.push((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/us-service-tax/:ownerType/:ownerSlug", ...routeGuards, async(req, res) => {
    try {
      const answer = await readUsOwnerServiceTax(pool, {
        ownerType: req.params.ownerType,
        ownerSlug: req.params.ownerSlug,
        auth: req.auth,
        identity: req.identity,
      });
      return res.status(answer.status).json(answer.body);
    } catch (error) {
      const reply = taxSettingsErrorResponse(error);
      return res.status(reply.status).json(reply.body);
    }
  });

  router.put("/us-service-tax/:ownerType/:ownerSlug", ...routeGuards, async(req, res) => {
    try {
      const answer = await saveUsOwnerServiceTax(pool, {
        ownerType: req.params.ownerType,
        ownerSlug: req.params.ownerSlug,
        auth: req.auth,
        identity: req.identity,
        body: req.body,
      });
      return res.status(answer.status).json(answer.body);
    } catch (error) {
      const reply = taxSettingsErrorResponse(error);
      return res.status(reply.status).json(reply.body);
    }
  });
  return router;
}
