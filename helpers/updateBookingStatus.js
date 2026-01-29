// helpers/updateBookingStatus.js — Postgres, Booking Lifecycle v2 (CLIENT-BASED)

import {
  assertStatusTransition,
  BOOKING_STATUSES,
} from "../core/bookingStatus.js";
import { hasSucceededPayment } from "../core/payments.js";

/**
 * @param {object} client - pg client (transaction owner)
 * @param {number} bookingId
 * @param {string} newStatus
 * @param {object} actor
 */
export default async function updateBookingStatus(
  client,
  bookingId,
  newStatus,
  actor = { type: "system" }
) {
  const { rows, rowCount } = await client.query(
    `
    SELECT id, status
    FROM bookings
    WHERE id = $1
    FOR UPDATE
    `,
    [bookingId]
  );

  if (rowCount === 0) {
    const err = new Error("BOOKING_NOT_FOUND");
    err.code = "BOOKING_NOT_FOUND";
    throw err;
  }

  const booking = rows[0];
  const fromStatus = booking.status;

  if (fromStatus === newStatus) {
    return { ok: true, idempotent: true };
  }

  // lifecycle guard
  assertStatusTransition(fromStatus, newStatus);

  // actor guard
  if (actor.type !== "system") {
    if (
      newStatus === BOOKING_STATUSES.PAID ||
      newStatus === BOOKING_STATUSES.COMPLETED ||
      newStatus === BOOKING_STATUSES.EXPIRED
    ) {
      const err = new Error("FORBIDDEN_STATUS_CHANGE");
      err.code = "FORBIDDEN_STATUS_CHANGE";
      throw err;
    }
  }

  // payment gate
  if (newStatus === BOOKING_STATUSES.PAID) {
    const paid = await hasSucceededPayment(client, bookingId);
    if (!paid) {
      const err = new Error("PAYMENT_REQUIRED");
      err.code = "PAYMENT_REQUIRED";
      throw err;
    }
  }

  await client.query(
    `
    UPDATE bookings
    SET status = $1
    WHERE id = $2
    `,
    [newStatus, bookingId]
  );

  return {
    ok: true,
    booking_id: bookingId,
    from: fromStatus,
    to: newStatus,
  };
}
