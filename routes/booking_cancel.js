export function registerBookingCancel(app, db) {
  app.post("/booking/cancel", (req, res) => {
    const { booking_id, reason } = req.body;

    if (!booking_id) {
      return res.status(400).json({ ok: false, error: "BOOKING_ID_REQUIRED" });
    }

    const booking = db.prepare(`
      SELECT id, active
      FROM bookings
      WHERE id = ?
    `).get(booking_id);

    if (!booking) {
      return res.status(404).json({ ok: false, error: "BOOKING_NOT_FOUND" });
    }

    if (booking.active !== 1) {
      return res.status(400).json({ ok: false, error: "BOOKING_ALREADY_INACTIVE" });
    }

    db.prepare(`
      UPDATE bookings
      SET active = 0,
          cancelled_at = datetime('now'),
          cancel_reason = ?
      WHERE id = ?
    `).run(reason || null, booking_id);

    res.json({
      ok: true,
      booking_id
    });
  });
}
