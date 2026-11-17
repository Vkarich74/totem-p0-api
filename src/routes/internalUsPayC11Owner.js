// US-PAY-C11 owner-only recipient selection.
// Mounted under /internal AFTER resolveAuth (JWT + live session check).
// Never makes a Stripe payment or marks a recipient as merchant-verified.
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  readUsC11OwnerCollector, chooseUsC11OwnerCollector,
} from "../services/usPayC11OwnerCollector.service.js";

export function buildUsPayC11OwnerRouter(pool) {
  if (!pool || typeof pool.connect !== "function") {
    throw new Error("US_PAY_C11_OWNER_DB_REQUIRED");
  }

  const router = express.Router();
  router.use(requireAuth);
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/us-pay-c11/bookings/:bookingId/collector", async (req, res) => {
    try {
      const answer = await readUsC11OwnerCollector(pool, {
        bookingId: req.params.bookingId,
        auth: req.auth,
      });
      return res.status(answer.status).json(answer.body);
    } catch (error) {
      console.error("US_C11_OWNER_COLLECTOR_GET_FAILED", String(error?.code || "UNKNOWN"));
      return res.status(503).json({ ok: false, error: "US_COLLECTOR_SERVICE_UNAVAILABLE" });
    }
  });

  router.put("/us-pay-c11/bookings/:bookingId/collector", async (req, res) => {
    try {
      const answer = await chooseUsC11OwnerCollector(pool, {
        bookingId: req.params.bookingId,
        auth: req.auth,
        body: req.body,
      });
      return res.status(answer.status).json(answer.body);
    } catch (error) {
      console.error("US_C11_OWNER_COLLECTOR_PUT_FAILED", String(error?.code || "UNKNOWN"));
      return res.status(503).json({ ok: false, error: "US_COLLECTOR_SERVICE_UNAVAILABLE" });
    }
  });

  return router;
}
