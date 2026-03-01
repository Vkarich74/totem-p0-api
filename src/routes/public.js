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

  // Create booking
  r.post("/salons/:slug/bookings", rlBookingCreate, resolveTenant, publicCreateBooking);

  // Availability
  r.get(
    "/salons/:slug/masters/:master_id/availability",
    rlAvailability,
    resolveTenant,
    publicMasterAvailability
  );

  /**
   * MASTER BOOKINGS
   */
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

  /**
   * MASTER CLIENTS (Mini CRM)
   */
  r.get("/masters/:master_id/clients", async (req, res) => {
    try {
      const { master_id } = req.params;

      const { rows } = await pool.query(
        `
        SELECT
          c.id,
          COALESCE(c.name, 'Клиент') AS name,
          COALESCE(c.phone, '') AS phone,
          COUNT(b.id)::int AS visits_count,
          MAX(b.start_at) AS last_visit,
          COALESCE(SUM(b.price_snapshot),0)::numeric AS total_spent
        FROM clients c
        LEFT JOIN bookings b ON b.client_id = c.id
        WHERE b.master_id = $1
        GROUP BY c.id
        ORDER BY last_visit DESC NULLS LAST
        `,
        [master_id]
      );

      const normalized = rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        visits_count: row.visits_count,
        last_visit: row.last_visit,
        total_spent: Number(row.total_spent) || 0,
      }));

      return res.json({
        ok: true,
        clients: normalized,
      });
    } catch (err) {
      console.error("PUBLIC_MASTER_CLIENTS_ERROR", err.message);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  /**
   * Salon resolve
   */
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
        });
      }

      return res.json({ ok: true, salon: rows[0] });
    } catch (err) {
      console.error("PUBLIC_SALON_RESOLVE_ERROR", err.message);
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  });

  /**
   * Salon metrics
   */
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

      const revenueRes = await pool.query(
        `SELECT COALESCE(SUM(price_snapshot), 0)::numeric AS revenue_total
         FROM bookings
         WHERE salon_id = $1`,
        [salon_id]
      );

      const revenue_total = Number(revenueRes.rows?.[0]?.revenue_total ?? 0);

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
      });
    }
  });

  return r;
}