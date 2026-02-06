// helpers/updateBookingStatus.js — Booking lifecycle v2 + AUDIT (Postgres)

import { assertStatusTransition } from "../core/bookingStatus.js";
import { hasSucceededPayment } from "../core/payments.js";

/**
 * @param {object} client - pg client (same transaction)
 * @param {number} bookingId
 * @param {string} newStatus
 * @param {object} actor
 * @param {string} source
 */
export default async function updateBookingStatus(
  client,
  bookingId,
  newStatus,
  actor = { type: "system", id: null },
  source = null
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

  // payment guard
  if (newStatus === "paid") {
    const paid = await hasSucceededPayment(client, bookingId);
    if (!paid) {
      const err = new Error("PAYMENT_REQUIRED");
      err.code = "PAYMENT_REQUIRED";
      throw err;
    }
  }

  // apply status
  await client.query(
    `
    UPDATE bookings
    SET status = $1
    WHERE id = $2
    `,
    [newStatus, bookingId]
  );

  // AUDIT LOG (same transaction)
  await client.query(
    `
    INSERT INTO booking_audit_log
      (booking_id, from_status, to_status, actor_type, actor_id, source)
    VALUES
      ($1, $2, $3, $4, $5, $6)
    `,
    [
      bookingId,
      fromStatus,
      newStatus,
      actor.type,
      actor.id,
      source,
    ]
  );

  return {
    ok: true,
    booking_id: bookingId,
    from: fromStatus,
    to: newStatus,
  };
}
