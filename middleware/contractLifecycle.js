import { CONTRACT_REGISTRY } from "../contracts/registry/index.js";
import { getDataContractHash } from "../utils/contractHash.js";

export function contractLifecycle(req, res, next) {
  const declaredVersion = req.headers["x-data-contract-version"];
  const declaredHash = req.headers["x-data-contract-hash"];

  if (!declaredVersion) {
    return res.status(400).json({
      error: "DATA_CONTRACT_VERSION_REQUIRED",
    });
  }

  const entry = CONTRACT_REGISTRY[declaredVersion];

  if (!entry) {
    return res.status(409).json({
      error: "UNKNOWN_DATA_CONTRACT_VERSION",
      allowed_versions: Object.keys(CONTRACT_REGISTRY),
    });
  }

  // deprecated warning
  if (entry.deprecated_since) {
    res.setHeader("X-Contract-Deprecated", entry.deprecated_since);
  }

  // hard sunset
  if (entry.sunset_at && new Date() >= new Date(entry.sunset_at)) {
    return res.status(410).json({
      error: "DATA_CONTRACT_SUNSET",
      sunset_at: entry.sunset_at,
    });
  }

  // hash assertion
  const expectedHash = getDataContractHash();
  if (declaredHash !== expectedHash) {
    return res.status(409).json({
      error: "DATA_CONTRACT_HASH_MISMATCH",
      expected: expectedHash,
      received: declaredHash,
    });
  }

  next();
}

export default contractLifecycle;
