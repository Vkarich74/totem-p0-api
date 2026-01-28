import dataContracts from "../../contracts/dataContracts.v1.js";

/**
 * Contract-aware adapter for Payment analytics
 * Immutable projection: storage -> contract
 */
const CONTRACT_FIELDS = new Set(
  dataContracts.contracts.entities.payment.required.concat(
    dataContracts.contracts.entities.payment.optional
  )
);

export function adaptPayment(row) {
  const projected = {};

  // primary key alias
  if ("id" in row) {
    projected.payment_id = row.id;
  }

  for (const field of CONTRACT_FIELDS) {
    if (field in row) {
      projected[field] = row[field];
    }
  }

  // required fields enforcement
  for (const req of dataContracts.contracts.entities.payment.required) {
    if (!(req in projected)) {
      throw new Error(`BI_CONTRACT_MISSING: payment.${req}`);
    }
  }

  return projected;
}

export default { adaptPayment };
