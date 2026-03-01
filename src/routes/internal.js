import express from "express";

import { confirmBooking } from "./confirmBooking.js";
import { completeBooking } from "./completeBooking.js";

/**
 * INTERNAL API (POSTPAID)
 */

export function createInternalRouter(deps) {
  const { rlInternal } = deps;

  const r = express.Router();

  r.post("/bookings/:id/confirm", rlInternal, confirmBooking);
  r.post("/bookings/:id/complete", rlInternal, completeBooking);

  return r;
}