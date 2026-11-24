// Retired legacy router. Current SDK uses canonical /internal/auth/*.
import express from "express";
const router=express.Router();
const retired=(_req,res)=>res.status(410).json({ok:false,error:"LEGACY_AUTH_DISABLED"});
router.post("/login",retired);
router.post("/start",retired);
router.post("/verify",retired);
router.get("/resolve",(_req,res)=>res.json({role:"public"}));
export default router;
