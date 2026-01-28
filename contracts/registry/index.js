import v1 from "../dataContracts.v1.js";

export const CONTRACT_REGISTRY = {
  "1.0.0": {
    contract: v1,
    status: "active",
    deprecated_since: null,
    sunset_at: null,
  },

  // пример будущей версии
  "2.0.0": {
    contract: null,
    status: "planned",
    deprecated_since: null,
    sunset_at: null,
  },
};

export const ACTIVE_CONTRACT_VERSION = "1.0.0";

export function getContract(version) {
  return CONTRACT_REGISTRY[version] || null;
}

export function getActiveContract() {
  return CONTRACT_REGISTRY[ACTIVE_CONTRACT_VERSION];
}
