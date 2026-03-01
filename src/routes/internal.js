import express from "express";
import { pool } from "../db.js";

import { confirmBooking } from "./confirmBooking.js";
import { completeBooking } from "./completeBooking.js";
import calendarRouter from "./calendar.js";

/**
 * INTERNAL API (POSTPAID / AUTH REQUIRED)
 */

export function createInternalRouter(deps) {
  const { rlInternal } = deps;

  const r = express.Router();

  // Booking lifecycle
  r.post("/bookings/:id/confirm", rlInternal, confirmBooking);
  r.post("/bookings/:id/complete", rlInternal, completeBooking);

  // Calendar
  r.use("/calendar", rlInternal, calendarRouter);

  /**
   * UPDATE MASTER PROFILE
   */
  r.put("/masters/:master_id/profile", rlInternal, async (req, res) => {
    try {
      const { master_id } = req.params;
      const { name } = req.body;

      if (!name || name.trim().length < 2) {
        return res.status(400).json({
          ok: false,
          error: "INVALID_NAME",
        });
      }

      const { rowCount } = await pool.query(
        `
        UPDATE masters
        SET name = $1
        WHERE id = $2
        `,
        [name.trim(), master_id]
      );

      if (rowCount === 0) {
        return res.status(404).json({
          ok: false,
          error: "MASTER_NOT_FOUND",
        });
      }

      return res.json({
        ok: true,
      });
    } catch (err) {
      console.error("INTERNAL_MASTER_UPDATE_ERROR", err.message);
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  });

  return r;
}