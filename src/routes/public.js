import express from "express";
import { pool } from "../db.js";

import { publicCreateBooking } from "./publicCreateBooking.js";
import { publicMasterAvailability } from "./publicAvailability.js";

/**
 * PUBLIC API LAYER
 */

export function createPublicRouter(deps) {
  const { resolveTenant, rlAvailability, rlBookingCreate } = deps;

  const r = express.Router();

  // Create booking
  r.post(
    "/salons/:slug/bookings",
    rlBookingCreate,
    resolveTenant,
    publicCreateBooking
  );

  // Availability
  r.get(
    "/salons/:slug/masters/:master_id/availability",
    rlAvailability,
    resolveTenant,
    publicMasterAvailability
  );

  /**
   * SALON METRICS
   */
  r.get("/salons/:slug/metrics", resolveTenant, async (req, res) => {
    try {
      const { salon_id } = req.tenant;

      const bookingsRes = await pool.query(
        `SELECT COUNT(*)::int AS bookings_count
         FROM bookings
         WHERE salon_id = $1`,
        [salon_id]
      );

      const revenueRes = await pool.query(
        `SELECT COALESCE(SUM(price_snapshot),0)::numeric AS revenue_total
         FROM bookings
         WHERE salon_id = $1`,
        [salon_id]
      );

      const bookings_count =
        bookingsRes.rows[0]?.bookings_count || 0;

      const revenue_total = Number(
        revenueRes.rows[0]?.revenue_total || 0
      );

      const avg_check =
        bookings_count > 0
          ? Math.round(
              (revenue_total / bookings_count) * 100
            ) / 100
          : 0;

      return res.json({
        ok: true,
        metrics: {
          bookings_count,
          revenue_total,
          avg_check,
        },
      });
    } catch (err) {
      console.error("PUBLIC_SALON_METRICS_ERROR", err.message);
      return res
        .status(500)
        .json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  /**
   * SALON BOOKINGS
   */
  r.get("/salons/:slug/bookings", resolveTenant, async (req, res) => {
    try {
      const { salon_id } = req.tenant;
      const { status, master_id } = req.query;

      let conditions = ["b.salon_id = $1"];
      let values = [salon_id];
      let index = 2;

      if (status) {
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
            return res
              .status(400)
              .json({ ok: false, error: "INVALID_STATUS" });
        }

        conditions.push(`b.status = ANY($${index})`);
        values.push(dbStatuses);
        index++;
      }

      if (master_id) {
        conditions.push(`b.master_id = $${index}`);
        values.push(master_id);
        index++;
      }

      const { rows } = await pool.query(
        `
        SELECT
          b.id,
          b.master_id,
          m.name AS master_name,
          COALESCE(c.name, 'Клиент') AS client_name,
          COALESCE(s.name, 'Услуга') AS service_name,
          b.start_at,
          b.end_at,
          b.status,
          b.price_snapshot
        FROM bookings b
        LEFT JOIN masters m ON m.id = b.master_id
        LEFT JOIN clients c ON c.id = b.client_id
        LEFT JOIN services_v2 s ON s.id = b.service_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY b.start_at DESC
        `,
        values
      );

      const normalized = rows.map((row) => {
        let uiStatus = "confirmed";
        if (row.status === "completed") uiStatus = "completed";
        if (
          row.status === "canceled" ||
          row.status === "cancelled"
        )
          uiStatus = "cancelled";

        return {
          id: row.id,
          master_id: row.master_id,
          master_name: row.master_name,
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
      console.error("PUBLIC_SALON_BOOKINGS_ERROR", err.message);
      return res
        .status(500)
        .json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  /**
   * SALON MASTERS
   */
  r.get("/salons/:slug/masters", async (req, res) => {
    try {
      const { slug } = req.params;

      const { rows } = await pool.query(
        `
        SELECT
          m.id,
          m.slug,
          m.name,
          m.active
        FROM masters m
        JOIN master_salon ms ON ms.master_id = m.id
        JOIN salons s ON s.id = ms.salon_id
        WHERE s.slug = $1
        ORDER BY m.name ASC
        `,
        [slug]
      );

      return res.json({ ok: true, masters: rows });
    } catch (err) {
      console.error("PUBLIC_SALON_MASTERS_ERROR", err.message);
      return res
        .status(500)
        .json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  /**
   * MASTER PROFILE
   */
  r.get("/masters/:master_id/profile", async (req, res) => {
    try {
      const { master_id } = req.params;

      const { rows } = await pool.query(
        `
        SELECT id, slug, name, active, created_at
        FROM masters
        WHERE id = $1
        `,
        [master_id]
      );

      if (!rows.length) {
        return res
          .status(404)
          .json({ ok: false, error: "MASTER_NOT_FOUND" });
      }

      return res.json({ ok: true, profile: rows[0] });
    } catch (err) {
      console.error("PUBLIC_MASTER_PROFILE_ERROR", err.message);
      return res
        .status(500)
        .json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });

  return r;
}