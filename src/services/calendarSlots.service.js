export async function releaseCalendarSlotForBooking(dbClient, bookingId, reason = null) {
  const safeBookingId = Number(bookingId);

  if (!dbClient || !Number.isInteger(safeBookingId) || safeBookingId <= 0) {
    return {
      booking_id: Number.isInteger(safeBookingId) && safeBookingId > 0 ? safeBookingId : null,
      calendar_slot_id: null,
      released: false,
      previous_status: null,
      new_status: null
    };
  }

  const bookingRes = await dbClient.query(
    `SELECT id, calendar_slot_id
     FROM public.bookings
     WHERE id = $1
     FOR UPDATE
     LIMIT 1`,
    [safeBookingId]
  );

  if (!bookingRes.rows.length) {
    return {
      booking_id: safeBookingId,
      calendar_slot_id: null,
      released: false,
      previous_status: null,
      new_status: null
    };
  }

  const bookingRow = bookingRes.rows[0];
  const calendarSlotId = bookingRow.calendar_slot_id || null;

  if (!calendarSlotId) {
    return {
      booking_id: safeBookingId,
      calendar_slot_id: null,
      released: false,
      previous_status: null,
      new_status: null
    };
  }

  const slotRes = await dbClient.query(
    `SELECT id, status
     FROM public.calendar_slots
     WHERE id = $1
     FOR UPDATE
     LIMIT 1`,
    [calendarSlotId]
  );

  if (!slotRes.rows.length) {
    return {
      booking_id: safeBookingId,
      calendar_slot_id: calendarSlotId,
      released: false,
      previous_status: null,
      new_status: null
    };
  }

  const previousStatus = String(slotRes.rows[0].status || "").trim().toLowerCase();

  if (previousStatus === "cancelled") {
    return {
      booking_id: safeBookingId,
      calendar_slot_id: calendarSlotId,
      released: false,
      previous_status: previousStatus,
      new_status: "cancelled"
    };
  }

  const updated = await dbClient.query(
    `UPDATE public.calendar_slots
     SET status = 'cancelled'
     WHERE id = $1
       AND status <> 'cancelled'
     RETURNING status`,
    [calendarSlotId]
  );

  return {
    booking_id: safeBookingId,
    calendar_slot_id: calendarSlotId,
    released: updated.rowCount > 0,
    previous_status: previousStatus,
    new_status: updated.rows[0]?.status || previousStatus || "cancelled",
    reason: reason || null
  };
}
