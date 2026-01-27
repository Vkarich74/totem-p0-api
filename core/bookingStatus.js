export const BOOKING_STATUSES = {
  CREATED: 'created',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED_BY_CLIENT: 'cancelled_by_client',
  CANCELLED_BY_MASTER: 'cancelled_by_master',
  NO_SHOW: 'no_show',
};

export const ALLOWED_TRANSITIONS = {
  created: ['confirmed', 'cancelled_by_client', 'cancelled_by_master'],
  confirmed: ['completed', 'no_show', 'cancelled_by_client', 'cancelled_by_master'],
  completed: [],
  cancelled_by_client: [],
  cancelled_by_master: [],
  no_show: [],
};

export function canChangeStatus(from, to) {
  return ALLOWED_TRANSITIONS[from]?.includes(to);
}
