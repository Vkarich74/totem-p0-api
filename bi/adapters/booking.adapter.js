import dataContracts from "../../contracts/dataContracts.v1.js";

/**
 * Contract-aware adapter for Booking analytics
 * Immutable projection: storage -> contract
 */
const CONTRACT_FIELDS = new Set(
  dataContracts.contracts.entities.booking.required.concat(
    dataContracts.contracts.entities.booking.optional
  )
);

export function adaptBooking(row) {
  const projected = {};

  // primary key alias
  if ("id" in row) {
    projected.booking_id = row.id;
  }

  for (const field of CONTRACT_FIELDS) {
    if (field in row) {
      projected[field] = row[field];
    }
  }

  // final guard: required fields must exist
  for (const req of dataContracts.contracts.entities.booking.required) {
    if (!(req in projected)) {
      throw new Error(`BI_CONTRACT_MISSING: booking.${req}`);
    }
  }

  return projected;
}

export default { adaptBooking };
