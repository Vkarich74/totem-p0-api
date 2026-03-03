import { pool } from "../db.js";

export async function publicLifecycle(req, res) {
  try {
    const { salon_id } = req.tenant;
    const bookingId = Number(req.params.id);
    const { action } = req.body || {};

    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return res.status(400).json({ ok: false, error: "BOOKING_ID_INVALID" });
    }

    if (!["complete", "cancel"].includes(action)) {
      return res.status(400).json({ ok: false, error: "INVALID_ACTION" });
    }

    const { rows } = await pool.query(
      `
      SELECT id, status
      FROM bookings
      WHERE id = $1 AND salon_id = $2
      `,
      [bookingId, salon_id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "BOOKING_NOT_FOUND" });
    }

    const currentStatus = rows[0].status;

    if (action === "complete") {
      if (currentStatus !== "confirmed" && currentStatus !== "reserved") {
        return res.status(409).json({
          ok: false,
          error: "INVALID_STATUS",
          status: currentStatus,
        });
      }

      await pool.query(
        `UPDATE bookings SET status = 'completed' WHERE id = $1`,
        [bookingId]
      );

      return res.json({ ok: true, status: "completed" });
    }

    if (action === "cancel") {
      if (currentStatus === "completed") {
        return res.status(409).json({
          ok: false,
          error: "CANNOT_CANCEL_COMPLETED",
        });
      }

      await pool.query(
        `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
        [bookingId]
      );

      return res.json({ ok: true, status: "cancelled" });
    }

  } catch (err) {
    console.error("PUBLIC_LIFECYCLE_ERROR", err.message);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
}