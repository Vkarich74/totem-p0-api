import crypto from "crypto";
import dataContracts from "../contracts/dataContracts.v1.js";

/**
 * Deterministic SHA256 hash of canonical data contract
 * Used for SDK / client assertion
 */
export function getDataContractHash() {
  const payload = JSON.stringify(dataContracts.contracts);
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export default {
  getDataContractHash,
};
