import express from "express";
import dataContracts from "../contracts/dataContracts.v1.js";
import { getDataContractHash } from "../utils/contractHash.js";
import { CONTRACT_REGISTRY, ACTIVE_CONTRACT_VERSION } from "../contracts/registry/index.js";

const router = express.Router();

router.get("/data/contracts", (req, res) => {
  if (req.headers["x-actor-type"] !== "system") {
    return res.status(403).json({ error: "SYSTEM_ONLY" });
  }

  res.json({
    active_version: ACTIVE_CONTRACT_VERSION,
    hash: getDataContractHash(),
    lifecycle: CONTRACT_REGISTRY,
    contract: dataContracts,
  });
});

export default router;
