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
   * SALON MASTERS LIST
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

      return res.json({
        ok: true,
        masters: rows,
      });
    } catch (err) {
      console.error("PUBLIC_SALON_MASTERS_ERROR", err.message);
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  });

  /**
   * MASTER PROFILE (READ)
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

      if (rows.length === 0) {
        return res.status(404).json({
          ok: false,
          error: "MASTER_NOT_FOUND",
        });
      }

      return res.json({
        ok: true,
        profile: rows[0],
      });
    } catch (err) {
      console.error("PUBLIC_MASTER_PROFILE_ERROR", err.message);
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  });

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
        if (
          row.status === "canceled" ||
          row.status === "cancelled"
        )
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
   * MASTER CLIENTS
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

  return r;
}