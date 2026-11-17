// TOTEM USA — TAX-04: owner-only quote for US beauty-service booking.
// GET historical immutable quote; POST creates it only for a VERIFIED
// selected salon/master collector. Never initiates a payment or refund.
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  readUsBookingServiceTaxQuote,
  createUsBookingServiceTaxQuote,
  usServiceTaxQuoteErrorResponse,
} from "../services/usServiceTaxQuote.service.js";

export function buildUsServiceTaxQuoteRouter(pool) {
  if (!pool || typeof pool.connect !== "function") {
    throw new Error("US_TAX_QUOTE_DB_REQUIRED");
  }
  const router = express.Router();
  router.use(requireAuth);
  router.use((_req,res,next)=>{
    res.set("Cache-Control","no-store");
    next();
  });

  router.get("/us-pay-c11/bookings/:bookingId/service-tax-quote",
    async (req,res)=>{
      try {
        const answer=await readUsBookingServiceTaxQuote(pool,{
          bookingId:req.params.bookingId,
          auth:req.auth,
          identity:req.identity,
        });
        return res.status(answer.status).json(answer.body);
      } catch(error) {
        const reply=usServiceTaxQuoteErrorResponse(error);
        return res.status(reply.status).json(reply.body);
      }
    }
  );
  router.post("/us-pay-c11/bookings/:bookingId/service-tax-quote",
    async (req,res)=>{
      try {
        const answer=await createUsBookingServiceTaxQuote(pool,{
          bookingId:req.params.bookingId,
          auth:req.auth,
          identity:req.identity,
          body:req.body,
        });
        return res.status(answer.status).json(answer.body);
      } catch(error) {
        const reply=usServiceTaxQuoteErrorResponse(error);
        return res.status(reply.status).json(reply.body);
      }
    }
  );
  return router;
}
