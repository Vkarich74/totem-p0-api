// US-PAY-C11 — additive authenticated read-only endpoint.
// Never expose Stripe account IDs, payment redirects or bank details.
import express from "express";
import { readUsPayC11Booking } from "../services/usPayC11ReadService.js";

export function buildPublicUsPayC11Router({ pool, verifyClientCabinetAccess }) {
  if (!pool || typeof pool.connect !== "function" ||
      typeof verifyClientCabinetAccess !== "function") {
    throw new Error("US_PAY_C11_DEPENDENCIES_MISSING");
  }
  const router = express.Router();

  router.get("/clients/:clientId/:token/us-pay-c11/:bookingId", async (req, res) => {
    res.set("Cache-Control", "no-store");
    let db;
    let transactionStarted = false;
    try {
      const clientId = Number(req.params.clientId);
      const bookingId = Number(req.params.bookingId);
      db = await pool.connect();
      await db.query("BEGIN READ ONLY");
      transactionStarted = true;
      await db.query("SET LOCAL statement_timeout = '3000ms'");

      const access = await verifyClientCabinetAccess(
        db, clientId, String(req.params.token || "")
      );
      if (!access.ok) {
        return res.status(access.status).json({ ok: false, error: access.error });
      }

      const result = await readUsPayC11Booking(db, { clientId, bookingId });
      return res.status(result.status).json(result.body);
    } catch (error) {
      console.error("US_PAY_C11_READ_ERROR", String(error?.code || "UNKNOWN"));
      return res.status(503).json({ ok: false, error: "US_PAY_C11_READ_UNAVAILABLE" });
    } finally {
      if (db) {
        let releaseError = null;
        if (transactionStarted) {
          try { await db.query("ROLLBACK"); } catch (error) {
            releaseError = error;
            console.error("US_PAY_C11_ROLLBACK_FAILED");
          }
        }
        // A failed rollback means this connection must not re-enter the pool.
        db.release(releaseError || undefined);
      }
    }
  });

  return router;
}
