// core/bookingStatus.js — canonical booking lifecycle (FINAL)

const ALLOWED_STATUSES = [
  "pending_payment",
  "paid",
  "expired",
  "cancelled",
  "completed",
];

// Allowed transitions matrix
const TRANSITIONS = {
  pending_payment: ["paid", "cancelled", "expired"],
  paid: ["completed", "cancelled"],
  expired: [],
  cancelled: [],
  completed: [],
};

/**
 * @param {string|null} from
 * @param {string} to
 */
export function assertStatusTransition(from, to) {
  // normalize creation
  if (from === null) {
    if (to !== "pending_payment") {
      const err = new Error("INVALID_STATUS_TRANSITION");
      err.code = "INVALID_STATUS_TRANSITION";
      throw err;
    }
    return true;
  }

  if (!ALLOWED_STATUSES.includes(from)) {
    const err = new Error("UNKNOWN_FROM_STATUS");
    err.code = "UNKNOWN_FROM_STATUS";
    throw err;
  }

  if (!ALLOWED_STATUSES.includes(to)) {
    const err = new Error("UNKNOWN_TO_STATUS");
    err.code = "UNKNOWN_TO_STATUS";
    throw err;
  }

  const allowedNext = TRANSITIONS[from] || [];
  if (!allowedNext.includes(to)) {
    const err = new Error("INVALID_STATUS_TRANSITION");
    err.code = "INVALID_STATUS_TRANSITION";
    throw err;
  }

  return true;
}
