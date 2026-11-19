// US-PAY-C11 / authenticated seller FULL or PARTIAL USD refund request.
// A POST is a genuine financial operation IF its separate feature flag
// is ever enabled in an audited production release. Default: OFF.
// Never accepts Stripe Account ID, booking recipient or payment ID as body.
import express from "express";
import {readUsC11LiveReconciliation} from "../services/usPayC11LiveReconciliation.service.js";
import {requireAuth} from "../middleware/requireAuth.js";
import {
  authorizeUsC11LiveRefund,
  quoteUsC11LiveRefund,
} from "../services/usPayC11LiveRefundAuthorization.service.js";

export function buildUsPayC11LiveRefundRouter(pool,{
  enabled=process.env.US_PAY_C11_LIVE_REFUNDS_ENABLED==="true",
  secretKey=process.env.US_PAY_C11_LIVE_STRIPE_SECRET_KEY||"",
  fetchImpl=globalThis.fetch,
}={}){
  if(!pool||typeof pool.connect!=="function"){
    throw Error("US_C11_REFUND_DB_REQUIRED");
  }
  const router=express.Router();
  const routeGuards = [requireAuth];
  routeGuards.push((_req,res,next)=>{
    res.set("Cache-Control","no-store");
    res.set("Referrer-Policy","no-referrer");
    if(!enabled){
      return res.status(404).json({ok:false,error:"US_C11_LIVE_REFUNDS_DISABLED"});
    }
    return next();
  });
  // Read-only manual reconciliation is available without enabling LIVE
  // Stripe charges/refunds. It is NOT a financial or review-close action.
  // Seller scope is rechecked against auth_sessions and US market in service.
  router.get(
    "/us-pay-c11/live-connect/:ownerType/:ownerId/bookings/:bookingId/reconciliation",
    requireAuth, async(req,res)=>{
      res.set("Cache-Control","private, no-store");
      res.set("Referrer-Policy","no-referrer");
      try{
        const result=await readUsC11LiveReconciliation(pool,{
          auth:req.auth,ownerType:req.params.ownerType,
          ownerId:req.params.ownerId,bookingId:req.params.bookingId,
        });
        return res.status(result.status).json(result.body);
      }catch(error){
        console.error("US_C11_RECONCILIATION_READ_FAILED",
          String(error?.code||"INTERNAL"));
        return res.status(503).json({
          ok:false,error:"US_C11_RECONCILIATION_READ_UNAVAILABLE",
        });
      }
    }
  );

  router.get(
    "/us-pay-c11/live-connect/:ownerType/:ownerId/bookings/:bookingId/refund/quote",
    ...routeGuards, async(req,res)=>{
      try {
        const answer=await quoteUsC11LiveRefund(pool,{
          auth:req.auth,ownerType:req.params.ownerType,
          ownerId:req.params.ownerId,bookingId:req.params.bookingId,
          proposedRefundMinor:req.query.amount_minor,
        });
        return res.status(answer.status).json(answer.body);
      }catch(error){
        console.error("US_C11_REFUND_QUOTE_FAILED",String(error?.code||"INTERNAL"));
        return res.status(503).json({
          ok:false,error:"US_C11_REFUND_QUOTE_SERVICE_UNAVAILABLE",
        });
      }
    }
  );
  router.post(
    "/us-pay-c11/live-connect/:ownerType/:ownerId/bookings/:bookingId/refund",
    ...routeGuards, async(req,res)=>{
      try{
        const result=await authorizeUsC11LiveRefund(pool,{
          auth:req.auth,ownerType:req.params.ownerType,
          ownerId:req.params.ownerId,bookingId:req.params.bookingId,
          body:req.body,secretKey,fetchImpl,
        });
        return res.status(result.status).json(result.body);
      }catch(error){
        // Uncertain Stripe refund outcomes must NEVER trigger a new
        // unrelated request, even after a network timeout or DB failure.
        console.error("US_C11_LIVE_REFUND_FAILED",
          String(error?.code||"INTERNAL"));
        return res.status(503).json({
          ok:false,error:"US_C11_REFUND_OUTCOME_UNKNOWN_USE_SAME_REQUEST_ID",
        });
      }
    }
  );
  return router;
}
