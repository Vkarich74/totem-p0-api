import { adaptBooking } from "./adapters/booking.adapter.js";
import { adaptPayment } from "./adapters/payment.adapter.js";
import { adaptPayout } from "./adapters/payout.adapter.js";

export function adapt(entity, rows) {
  switch (entity) {
    case "booking":
      return rows.map(adaptBooking);
    case "payment":
      return rows.map(adaptPayment);
    case "payout":
      return rows.map(adaptPayout);
    default:
      throw new Error(`UNKNOWN_BI_ENTITY: ${entity}`);
  }
}

export default {
  adapt,
};
