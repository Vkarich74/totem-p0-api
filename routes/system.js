
import express from "express";
import onboarding from "./system_onboarding_identity.js";

const router = express.Router();

router.use((req, res, next) => {
  const token = req.header("X-System-Token");
  if (!token || token !== "TECH_SYSTEM_TOKEN_TEMP_2026") {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

router.use("/", onboarding);

export default router;
