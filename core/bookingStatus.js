// core/bookingStatus.js — BOOKING LIFECYCLE v2 (POSTGRES, PROD)

export const BOOKING_STATUSES = {
  CREATED: "created",
  PAID: "paid",
  CONFIRMED: "confirmed",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};

export const TERMINAL_STATUSES = new Set([
  BOOKING_STATUSES.COMPLETED,
  BOOKING_STATUSES.CANCELLED,
  BOOKING_STATUSES.EXPIRED,
]);

export const ALLOWED_TRANSITIONS = {
  [BOOKING_STATUSES.CREATED]: [
    BOOKING_STATUSES.PAID,
    BOOKING_STATUSES.CANCELLED,
    BOOKING_STATUSES.EXPIRED,
  ],

  [BOOKING_STATUSES.PAID]: [
    BOOKING_STATUSES.CONFIRMED,
    BOOKING_STATUSES.CANCELLED,
  ],

  [BOOKING_STATUSES.CONFIRMED]: [
    BOOKING_STATUSES.COMPLETED,
    BOOKING_STATUSES.CANCELLED,
  ],

  [BOOKING_STATUSES.COMPLETED]: [],
  [BOOKING_STATUSES.CANCELLED]: [],
  [BOOKING_STATUSES.EXPIRED]: [],
};

export function canChangeStatus(from, to) {
  if (!from || !to) return false;
  if (TERMINAL_STATUSES.has(from)) return false;
  return ALLOWED_TRANSITIONS[from]?.includes(to) === true;
}

export function assertStatusTransition(from, to) {
  if (!canChangeStatus(from, to)) {
    const err = new Error(`INVALID_STATUS_TRANSITION: ${from} -> ${to}`);
    err.code = "INVALID_STATUS_TRANSITION";
    throw err;
  }
}
