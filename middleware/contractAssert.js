import { getDataContractHash } from "../utils/contractHash.js";

/**
 * Client must declare contract hash
 * Header: X-Data-Contract-Hash
 */
export function assertDataContract(req, res, next) {
  const clientHash = req.headers["x-data-contract-hash"];
  const serverHash = getDataContractHash();

  if (!clientHash) {
    return res.status(400).json({
      error: "DATA_CONTRACT_HASH_REQUIRED",
      expected: serverHash,
    });
  }

  if (clientHash !== serverHash) {
    return res.status(409).json({
      error: "DATA_CONTRACT_HASH_MISMATCH",
      expected: serverHash,
      received: clientHash,
    });
  }

  next();
}

export default assertDataContract;
