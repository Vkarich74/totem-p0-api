import express from "express";
import { pool } from "../db.js";

import { publicCreateBooking } from "./publicCreateBooking.js";
import { publicMasterAvailability } from "./publicAvailability.js";

/**
 * PUBLIC API LAYER
 * All public endpoints MUST live here.
 */

export function createPublicRouter(deps) {
  const { resolveTenant, rlAvailability, rlBookingCreate } = deps;

  const r = express.Router();

  r.post("/salons/:slug/bookings", rlBookingCreate, resolveTenant, publicCreateBooking);

  r.get(
    "/salons/:slug/masters/:master_id/availability",
    rlAvailability,
    resolveTenant,
    publicMasterAvailability
  );

  r.get("/masters/:master_id/bookings", async (req, res) => {
    try {
      const { master_id } = req.params;
      const { status } = req.query;

      if (!status) {
        return res.status(400).json({ ok: false, error: "STATUS_REQUIRED" });
      }

      let dbStatuses = [];

      switch (status) {
        case "confirmed":
          dbStatuses = ["reserved", "confirmed"];
          break;
        case "completed":
          dbStatuses = ["completed"];
          break;
        case "cancelled":
          dbStatuses = ["canceled", "cancelled"];
          break;
        default:
          return res.status(400).json({ ok: false, error: "INVALID_STATUS" });
      }

      const { rows } = await pool.query(
        `
        SELECT
          b.id,
          COALESCE(c.name, 'Unknown') AS client_name,
          COALESCE(s.name, 'Service') AS service_name,
          b.start_at,
          b.end_at,
          b.status,
          b.price_snapshot
        FROM bookings b
        LEFT JOIN clients c ON c.id = b.client_id
        LEFT JOIN services_v2 s ON s.id = b.service_id
        WHERE b.master_id = $1
          AND b.status = ANY($2)
        ORDER BY b.start_at ASC
        `,
        [master_id, dbStatuses]
      );

      const normalized = rows.map((row) => {
        let uiStatus = "confirmed";

        if (row.status === "completed") uiStatus = "completed";
        if (row.status === "canceled" || row.status === "cancelled")
          uiStatus = "cancelled";

        return {
          id: row.id,
          client_name: row.client_name,
          service_name: row.service_name,
          datetime_start: row.start_at,
          datetime_end: row.end_at,
          status: uiStatus,
          price: row.price_snapshot ?? 0,
        };
      });

      return res.json({ ok: true, bookings: normalized });
    } catch (err) {
      console.error("PUBLIC_MASTER_BOOKINGS_ERROR", err.message);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  r.get("/salons/:slug", resolveTenant, async (req, res) => {
    try {
      const { salon_id } = req.tenant;

      const { rows } = await pool.query(
        `SELECT id, slug, name, enabled, status
         FROM salons
         WHERE id = $1`,
        [salon_id]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "SALON_NOT_FOUND",
          request_id: req.request_id,
        });
      }

      return res.json({ ok: true, salon: rows[0] });
    } catch (err) {
      console.error("PUBLIC_SALON_RESOLVE_ERROR", err.message);
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
        request_id: req.request_id,
      });
    }
  });

  r.get("/salons/:slug/metrics", resolveTenant, async (req, res) => {
    try {
      const { salon_id } = req.tenant;

      const bookingsCountRes = await pool.query(
        `SELECT COUNT(*)::int AS bookings_count
         FROM bookings
         WHERE salon_id = $1`,
        [salon_id]
      );

      const bookings_count = bookingsCountRes.rows?.[0]?.bookings_count ?? 0;

      let revenue_total = 0;

      try {
        const revenueRes = await pool.query(
          `SELECT COALESCE(SUM(price_snapshot), 0)::numeric AS revenue_total
           FROM bookings
           WHERE salon_id = $1`,
          [salon_id]
        );
        revenue_total = Number(revenueRes.rows?.[0]?.revenue_total ?? 0);
        if (Number.isNaN(revenue_total)) revenue_total = 0;
      } catch {
        revenue_total = 0;
      }

      const avg_check =
        bookings_count > 0
          ? Math.round((revenue_total / bookings_count) * 100) / 100
          : 0;

      return res.json({
        ok: true,
        metrics: { bookings_count, revenue_total, avg_check },
      });
    } catch (err) {
      console.error("PUBLIC_SALON_METRICS_ERROR", err.message);
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
        request_id: req.request_id,
      });
    }
  });

  return r;
}