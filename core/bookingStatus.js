// core/bookingStatus.js — Booking Lifecycle v2 (SOURCE OF TRUTH)

export const BOOKING_STATUSES = {
  CREATED: "created",
  PAID: "paid",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};

export const ALLOWED_TRANSITIONS = {
  created: ["paid", "cancelled", "expired"],
  paid: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  expired: [],
};

export function assertStatusTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    const err = new Error("INVALID_STATUS_TRANSITION");
    err.code = "INVALID_STATUS_TRANSITION";
    throw err;
  }
}
