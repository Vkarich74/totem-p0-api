// TOTEM USA / TAX-07 — read-only owner scoped tax/refund reconciliation.
// No Stripe operations and no UK/KG/KZ financial route changes.
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { readUsServiceTaxReport } from "../services/usServiceTaxReport.service.js";

export function buildUsServiceTaxReportRouter(pool) {
  if(!pool||typeof pool.connect!=="function"){
    throw Error("US_TAX07_REPORT_DB_REQUIRED");
  }
  const router=express.Router();
  router.use(requireAuth);
  router.use((_req,res,next)=>{
    res.set("Cache-Control","no-store");
    res.set("Referrer-Policy","no-referrer");
    next();
  });
  router.get("/us-service-tax/report/:ownerType/:ownerId",async(req,res)=>{
    try{
      const result=await readUsServiceTaxReport(pool,{
        auth:req.auth,ownerType:req.params.ownerType,
        ownerId:req.params.ownerId,
      });
      return res.status(result.status).json(result.body);
    }catch(error){
      console.error("US_TAX07_REPORT_ROUTING_FAILED",String(error?.code||"UNKNOWN"));
      return res.status(503).json({
        ok:false,error:"US_TAX07_REPORT_UNAVAILABLE",
      });
    }
  });
  return router;
}
