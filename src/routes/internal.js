import express from "express";
import { pool } from "../db.js";
import crypto from "crypto";

import { confirmBooking } from "./confirmBooking.js";
import { completeBooking } from "./completeBooking.js";
import calendarRouter from "./calendar.js";

/**
 * INTERNAL API (AUTH REQUIRED)
 */

export function createInternalRouter(deps) {
  const { rlInternal } = deps;

  const r = express.Router();

  // ===============================
  // BOOKING LIFECYCLE
  // ===============================

  r.post("/bookings/:id/confirm", rlInternal, confirmBooking);
  r.post("/bookings/:id/complete", rlInternal, completeBooking);

  // Cancel booking
  r.post("/bookings/:id/cancel", rlInternal, async (req, res) => {
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

      const bookingResult = await client.query(
        `SELECT status FROM public.bookings
         WHERE id = $1
         FOR UPDATE`,
        [bookingId]
      );

      if (bookingResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Booking not found" });
      }

      if (bookingResult.rows[0].status === "canceled") {
        await client.query("COMMIT");
        return res.json({
          success: true,
          booking_id: bookingId,
          status: "canceled",
        });
      }

      await client.query(
        `UPDATE public.bookings
         SET status = 'canceled'
         WHERE id = $1`,
        [bookingId]
      );

      await client.query(
        `INSERT INTO public.api_idempotency_keys
         (idempotency_key, endpoint, request_hash, response_code, response_body)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          idempotencyKey,
          "cancel_booking",
          requestHash,
          200,
          { success: true, booking_id: bookingId, status: "canceled" },
        ]
      );

      await client.query("COMMIT");

      return res.json({
        success: true,
        booking_id: bookingId,
        status: "canceled",
      });

    } catch (err) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // ===============================
  // OWNER MASTERS LIST (NEW)
  // ===============================

  r.get("/salons/:slug/masters", rlInternal, async (req, res) => {
    const salonSlug = req.params.slug;

    if (!salonSlug) {
      return res.status(400).json({ error: "INVALID_SLUG" });
    }

    const client = await pool.connect();

    try {
      const salonResult = await client.query(
        `
        SELECT id
        FROM salons
        WHERE slug = $1
          AND enabled = true
          AND status = 'active'
        LIMIT 1
        `,
        [salonSlug]
      );

      if (!salonResult.rowCount) {
        return res.status(404).json({ error: "SALON_NOT_FOUND" });
      }

      const salonId = salonResult.rows[0].id;

      const { rows } = await client.query(
        `
        SELECT 
          m.id,
          m.slug,
          m.name,
          m.active,
          ms.status,
          ms.activated_at,
          ms.fired_at
        FROM master_salon ms
        JOIN masters m ON m.id = ms.master_id
        WHERE ms.salon_id = $1
        ORDER BY m.name ASC
        `,
        [salonId]
      );

      return res.json(
        rows.map((r) => ({
          id: r.id,
          master_slug: r.slug,
          name: r.name,
          active: r.active,
          status: r.status,
          activated_at: r.activated_at,
          fired_at: r.fired_at,
        }))
      );

    } catch (err) {
      console.error("INTERNAL_OWNER_MASTERS_ERROR", err.message);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    } finally {
      client.release();
    }
  });

  // ===============================
  // PROFILE UPDATES
  // ===============================

  r.put("/masters/:master_id/profile", rlInternal, async (req, res) => {
    try {
      const { master_id } = req.params;
      const { name } = req.body;

      if (!name || name.trim().length < 2) {
        return res.status(400).json({ ok: false, error: "INVALID_NAME" });
      }

      const { rowCount } = await pool.query(
        `UPDATE masters
         SET name = $1
         WHERE id = $2`,
        [name.trim(), master_id]
      );

      if (!rowCount) {
        return res.status(404).json({ ok: false, error: "MASTER_NOT_FOUND" });
      }

      return res.json({ ok: true });

    } catch (err) {
      console.error("INTERNAL_MASTER_UPDATE_ERROR", err.message);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  r.put("/salons/:salon_id", rlInternal, async (req, res) => {
    try {
      const { salon_id } = req.params;
      const { name } = req.body;

      if (!name || name.trim().length < 2) {
        return res.status(400).json({ ok: false, error: "INVALID_NAME" });
      }

      const { rowCount } = await pool.query(
        `UPDATE salons
         SET name = $1
         WHERE id = $2`,
        [name.trim(), salon_id]
      );

      if (!rowCount) {
        return res.status(404).json({ ok: false, error: "SALON_NOT_FOUND" });
      }

      return res.json({ ok: true });

    } catch (err) {
      console.error("INTERNAL_SALON_UPDATE_ERROR", err.message);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  // ===============================

  r.use("/calendar", rlInternal, calendarRouter);

  return r;
}