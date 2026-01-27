import { hasSucceededPayment } from "../core/payments.js";

const ALLOWED_STATUSES = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
];

function resolveCurrentStatus(booking) {
  if (booking.cancelled_at) return "cancelled";
  if (booking.active === 1) return "confirmed";
  return "pending";
}

function assertActorPermission(booking, actor, newStatus) {
  if (actor.type === "system") return;

  if (newStatus === "completed") {
    const err = new Error("FORBIDDEN_COMPLETED");
    err.code = "FORBIDDEN_COMPLETED";
    throw err;
  }

  if (actor.type === "salon" && String(booking.salon_id) !== String(actor.id)) {
    const err = new Error("FORBIDDEN_NOT_OWNER");
    err.code = "FORBIDDEN_NOT_OWNER";
    throw err;
  }

  if (actor.type === "master" && String(booking.master_id) !== String(actor.id)) {
    const err = new Error("FORBIDDEN_NOT_OWNER");
    err.code = "FORBIDDEN_NOT_OWNER";
    throw err;
  }
}

export default function updateBookingStatus(
  db,
  bookingId,
  newStatus,
  actor = { type: "system", id: null }
) {
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    const err = new Error("INVALID_STATUS");
    err.code = "INVALID_STATUS";
    throw err;
  }

  const tx = db.transaction(() => {
    const booking = db
      .prepare(
        `SELECT
           id,
           salon_id,
           master_id,
           active,
           cancelled_at,
           source
         FROM bookings
         WHERE id = ?`
      )
      .get(bookingId);

    if (!booking) {
      const err = new Error("BOOKING_NOT_FOUND");
      err.code = "BOOKING_NOT_FOUND";
      throw err;
    }

    const fromStatus = resolveCurrentStatus(booking);

    if (fromStatus === "cancelled") {
      const err = new Error("BOOKING_ALREADY_CANCELLED");
      err.code = "BOOKING_ALREADY_CANCELLED";
      throw err;
    }

    if (fromStatus === newStatus) {
      const err = new Error("STATUS_ALREADY_SET");
      err.code = "STATUS_ALREADY_SET";
      throw err;
    }

    assertActorPermission(booking, actor, newStatus);

    // 🔐 PAYMENT GATE
    if (newStatus === "completed") {
      const paid = hasSucceededPayment(db, bookingId);
      if (!paid) {
        const err = new Error("PAYMENT_REQUIRED");
        err.code = "PAYMENT_REQUIRED";
        throw err;
      }
    }

    // APPLY STATE
    if (newStatus === "confirmed") {
      db.prepare(`UPDATE bookings SET active = 1 WHERE id = ?`).run(bookingId);
    }

    if (newStatus === "pending") {
      db.prepare(`UPDATE bookings SET active = 0 WHERE id = ?`).run(bookingId);
    }

    if (newStatus === "cancelled") {
      db.prepare(
        `UPDATE bookings SET cancelled_at = datetime('now') WHERE id = ?`
      ).run(bookingId);
    }

    // LOG
    db.prepare(
      `INSERT INTO booking_status_log
       (booking_id, from_status, to_status, changed_at, actor_type, actor_id)
       VALUES (?, ?, ?, datetime('now'), ?, ?)`
    ).run(
      bookingId,
      fromStatus,
      newStatus,
      actor.type,
      actor.id
    );

    return { from: fromStatus, to: newStatus };
  });

  return tx();
}
