// US-PAY / TAX-03 — authorized USD cents service-price settings only.
// No Stripe charge, tax calculation, refund, legacy price conversion or KG writes.
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  readUsOwnerServicePrice,
  saveUsOwnerServicePrice,
  usServicePriceErrorResponse,
} from "../services/usServicePrice.service.js";

export function buildUsServicePricesRouter(pool) {
  if (!pool || typeof pool.connect !== "function") {
    throw new Error("US_SERVICE_PRICE_DB_REQUIRED");
  }
  const router = express.Router();
  const routeGuards = [requireAuth];
  routeGuards.push((_req,res,next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/us-service-prices/:ownerType/:ownerSlug/:serviceLinkId",
    ...routeGuards, async(req,res) => {
      try {
        const answer = await readUsOwnerServicePrice(pool, {
          ownerType: req.params.ownerType,
          ownerSlug: req.params.ownerSlug,
          serviceLinkId: req.params.serviceLinkId,
          auth: req.auth,
          identity: req.identity,
        });
        return res.status(answer.status).json(answer.body);
      } catch (error) {
        const reply = usServicePriceErrorResponse(error);
        return res.status(reply.status).json(reply.body);
      }
    }
  );

  router.put("/us-service-prices/:ownerType/:ownerSlug/:serviceLinkId",
    ...routeGuards, async(req,res) => {
      try {
        const answer = await saveUsOwnerServicePrice(pool, {
          ownerType: req.params.ownerType,
          ownerSlug: req.params.ownerSlug,
          serviceLinkId: req.params.serviceLinkId,
          auth: req.auth,
          identity: req.identity,
          body: req.body,
        });
        return res.status(answer.status).json(answer.body);
      } catch (error) {
        const reply = usServicePriceErrorResponse(error);
        return res.status(reply.status).json(reply.body);
      }
    }
  );
  return router;
}
