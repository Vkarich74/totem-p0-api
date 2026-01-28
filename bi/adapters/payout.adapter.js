import dataContracts from "../../contracts/dataContracts.v1.js";

/**
 * Contract-aware adapter for Payout analytics
 * Immutable projection
 */
const CONTRACT_FIELDS = new Set(
  dataContracts.contracts.entities.payout.required.concat(
    dataContracts.contracts.entities.payout.optional
  )
);

export function adaptPayout(row) {
  const projected = {};

  if ("id" in row) {
    projected.payout_id = row.id;
  }

  for (const field of CONTRACT_FIELDS) {
    if (field in row) {
      projected[field] = row[field];
    }
  }

  for (const req of dataContracts.contracts.entities.payout.required) {
    if (!(req in projected)) {
      throw new Error(`BI_CONTRACT_MISSING: payout.${req}`);
    }
  }

  return projected;
}

export default { adaptPayout };
