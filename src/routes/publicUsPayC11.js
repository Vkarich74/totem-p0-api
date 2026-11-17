// US-PAY-C11 — additive authenticated read-only endpoint.
// Never expose Stripe account IDs, payment redirects or bank details.
import express from "express";
import { readUsPayC11Booking } from "../services/usPayC11ReadService.js";
import { prepareUsC11LiveDirectCharge } from "../services/usPayC11LiveDirectCharge.service.js";

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

      const result = await readUsPayC11Booking(db, {
        clientId, bookingId,
        // Test-mode merchant projections disabled in Production by default.
        allowTestStripeMode:
          process.env.US_PAY_C11_STRIPE_TEST_MODE === "true" &&
          process.env.NODE_ENV !== "production",
      });
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

  // LIVE direct charge initiation is OFF until actual US seller onboarding,
  // production schema validation, backup and dedicated Stripe signing secret.
  // An authenticated client cabinet token is mandatory even when flag enabled.
  router.post("/clients/:clientId/:token/us-pay-c11/:bookingId/intent",
    async(req,res)=>{
      res.set("Cache-Control","no-store");
      res.set("Referrer-Policy","no-referrer");
      if(process.env.US_PAY_C11_LIVE_PAYMENTS_ENABLED!=="true") {
        return res.status(404).json({
          ok:false,error:"US_C11_LIVE_PAYMENTS_NOT_ENABLED",
        });
      }
      if(!req.body || typeof req.body!=="object" ||
         Array.isArray(req.body) || Object.keys(req.body).length>0) {
        return res.status(400).json({
          ok:false,error:"US_C11_LIVE_PAYMENT_BODY_FORBIDDEN",
        });
      }
      try {
        const answer=await prepareUsC11LiveDirectCharge(pool,{
          clientId:req.params.clientId,clientToken:req.params.token,
          bookingId:req.params.bookingId,
          secretKey:process.env.US_PAY_C11_LIVE_STRIPE_SECRET_KEY||"",
          stripePublishableKey:process.env.US_PAY_C11_LIVE_STRIPE_PUBLISHABLE_KEY||"",
        });
        return res.status(answer.status).json(answer.body);
      }catch(error){
        // No client tokens, card data, Stripe responses or account details.
        console.error("US_C11_LIVE_PAYMENT_PREPARE_FAILED",
          String(error?.code||"INTERNAL"));
        return res.status(503).json({
          ok:false,error:"US_C11_LIVE_PAYMENT_SERVICE_UNAVAILABLE",
        });
      }
    }
  );

  return router;
}
