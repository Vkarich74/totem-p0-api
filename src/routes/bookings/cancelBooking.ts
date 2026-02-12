import { Request, Response } from "express";
import { pool } from "../../db";
import crypto from "crypto";

export const cancelBooking = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const bookingId = Number(req.params.id);
    const idempotencyKey = req.header("Idempotency-Key");

    if (!bookingId) {
      return res.status(400).json({ error: "Invalid booking id" });
    }

    if (!idempotencyKey) {
      return res.status(400).json({ error: "Missing Idempotency-Key header" });
    }

    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ bookingId }))
      .digest("hex");

    await client.query("BEGIN");

    // 1️⃣ Check idempotency
    const existingKey = await client.query(
      `SELECT response_code, response_body
       FROM public.api_idempotency_keys
       WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    if (existingKey.rowCount > 0) {
      await client.query("ROLLBACK");
      return res
        .status(existingKey.rows[0].response_code)
        .json(existingKey.rows[0].response_body);
    }

    // 2️⃣ Lock booking
    const bookingResult = await client.query(
      `SELECT * FROM public.bookings
       WHERE id = $1
       FOR UPDATE`,
      [bookingId]
    );

    if (bookingResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = bookingResult.rows[0];

    // 3️⃣ Idempotent cancel
    if (booking.status === "canceled") {
      const response = {
        success: true,
        booking_id: bookingId,
        status: "canceled"
      };

      await client.query(
        `INSERT INTO public.api_idempotency_keys
         (idempotency_key, endpoint, request_hash, response_code, response_body)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          idempotencyKey,
          "cancel_booking",
          requestHash,
          200,
          response
        ]
      );

      await client.query("COMMIT");
      return res.status(200).json(response);
    }

    // 4️⃣ Update status → DB enforce + audit + calendar sync
    await client.query(
      `UPDATE public.bookings
       SET status = 'canceled'
       WHERE id = $1`,
      [bookingId]
    );

    const response = {
      success: true,
      booking_id: bookingId,
      status: "canceled"
    };

    // 5️⃣ Store idempotency result
    await client.query(
      `INSERT INTO public.api_idempotency_keys
       (idempotency_key, endpoint, request_hash, response_code, response_body)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        idempotencyKey,
        "cancel_booking",
        requestHash,
        200,
        response
      ]
    );

    await client.query("COMMIT");

    return res.status(200).json(response);

  } catch (err: any) {
    await client.query("ROLLBACK");
    return res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
};
