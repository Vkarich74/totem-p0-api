import express from "express";
import crypto from "crypto";
import { pool } from "../db.js";

import { publicCreateBooking } from "./publicCreateBooking.js";
import { publicMasterAvailability } from "./publicAvailability.js";
import { publicLifecycle } from "./publicLifecycle.js";

// ✅ AUTH ROUTER FROM LIVE PUBLIC LAYER
import authRouter from "../../routes_public/auth.js";

// ✅ NEW
import buildPublicAccessGuard from "../middleware/publicAccessGuard.js";
import { TEMPLATE_VERSION_V1 } from "../contracts/templates/templateConstants.js";
import { getPublishedSource } from "../services/templates/templateDocumentService.js";

function hashClientCabinetToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function buildClientPersonalLink(clientId, token) {
  return `#/client/${clientId}/${token}`;
}

/**
 * PUBLIC API LAYER
 */

export function createPublicRouter(deps) {
  const { resolveTenant, rlAvailability, rlBookingCreate } = deps;

  const r = express.Router();

  /**
   * AUTH
   */
  r.use("/auth", authRouter);

  /**
   * CREATE BOOKING
   */
  r.post(
    "/salons/:slug/bookings",
    rlBookingCreate,
    resolveTenant,
    buildPublicAccessGuard("booking_create"),
    publicCreateBooking
  );

  /**
   * BOOKING LIFECYCLE (PUBLIC)
   */
  r.post(
    "/salons/:slug/bookings/:id/lifecycle",
    resolveTenant,
    buildPublicAccessGuard("booking_create"),
    publicLifecycle
  );

  /**
   * AVAILABILITY
   */
  r.get(
    "/salons/:slug/masters/:master_id/availability",
    rlAvailability,
    resolveTenant,
    buildPublicAccessGuard("availability"),
    publicMasterAvailability
  );

  /**
   * MASTER PUBLIC PAGE
   */
  r.get(
    "/masters/:slug",
    async (req, res) => {
      const db = await pool.connect();
      try {
        const slug = String(req.params.slug || "").trim();
        if (!slug) {
          return res.status(400).json({ ok: false, error: "MASTER_SLUG_REQUIRED" });
        }

        const { rows } = await db.query(
          `
          SELECT id, slug, name, active
          FROM masters
          WHERE slug = $1
            AND COALESCE(active, true) = true
          LIMIT 1
          `,
          [slug]
        );

        if (!rows.length) {
          return res.status(404).json({ ok: false, error: "MASTER_NOT_FOUND" });
        }

        const master = rows[0];

        const published = await getPublishedSource(
          db,
          "master",
          slug,
          TEMPLATE_VERSION_V1
        );

        const publishedExists = Boolean(published?.document?.status?.published_exists);
        const payload = published?.payload || {};
        const meta = published?.document?.meta || {};

        return res.json({
          ok: true,
          master,
          owner_type: "master",
          owner_slug: slug,
          template_version: TEMPLATE_VERSION_V1,
          published_exists: publishedExists,
          payload,
          meta
        });
      } catch (err) {
        console.error("PUBLIC_MASTER_PROFILE_ERROR", err.message);
        return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
      } finally {
        db.release();
      }
    }
  );

  /**
   * SALON PROFILE
   */
  r.get(
    "/salons/:slug",
    async (req, res) => {
      try {
        const slug = String(req.params.slug || "").trim();

        if (!slug) {
          return res
            .status(400)
            .json({ ok: false, error: "SALON_SLUG_REQUIRED" });
        }

        const { rows } = await pool.query(
          `
          SELECT id, slug, name
          FROM salons
          WHERE slug = $1
            AND COALESCE(enabled, true) = true
            AND COALESCE(status, 'active') = 'active'
          LIMIT 1
          `,
          [slug]
        );

        if (!rows.length) {
          return res
            .status(404)
            .json({ ok: false, error: "SALON_NOT_FOUND" });
        }

        return res.json({ ok: true, salon: rows[0] });
      } catch (err) {
        console.error("PUBLIC_SALON_PROFILE_ERROR", err.message);
        return res
          .status(500)
          .json({ ok: false, error: "INTERNAL_ERROR" });
      }
    }
  );

  /**
   * SALON METRICS
   */
  r.get(
    "/salons/:slug/metrics",
    resolveTenant,
    buildPublicAccessGuard("metrics"),
    async (req, res) => {
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
            ? Math.round((revenue_total / bookings_count) * 100) / 100
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
    }
  );

  /**
   * SALON BOOKINGS
   */
  r.get(
    "/salons/:slug/bookings",
    resolveTenant,
    buildPublicAccessGuard("booking_read"),
    async (req, res) => {
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
    }
  );

  /**
   * SALON SERVICES
   */
  r.get(
    "/salons/:slug/services",
    resolveTenant,
    buildPublicAccessGuard("page"),
    async (req, res) => {
      try {
        const { salon_id } = req.tenant;

        const { rows } = await pool.query(
          `
          SELECT
            sms.id,
            sms.salon_id,
            sms.master_id,
            m.slug AS master_slug,
            m.name AS master_name,
            sms.service_pk,
            s.service_id AS catalog_service_id,
            s.name,
            sms.price,
            sms.duration_min,
            sms.active
          FROM salon_master_services sms
          JOIN services s ON s.id = sms.service_pk
          LEFT JOIN masters m ON m.id = sms.master_id
          WHERE sms.salon_id = $1
            AND COALESCE(sms.active, true) = true
          ORDER BY sms.id DESC
          `,
          [salon_id]
        );

        return res.json({ ok: true, services: rows });
      } catch (err) {
        console.error("PUBLIC_SALON_SERVICES_ERROR", err);
        return res
          .status(500)
          .json({ ok: false, error: "PUBLIC_SALON_SERVICES_FETCH_FAILED" });
      }
    }
  );

  /**
   * SALON MASTERS
   */
  r.get(
    "/salons/:slug/masters",
    resolveTenant,
    buildPublicAccessGuard("page"),
    async (req, res) => {
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
    }
  );

  /**
   * CLIENT CABINET V1
   */
  r.get(
    "/clients/:clientId/:token",
    async (req, res) => {
      const db = await pool.connect();

      try {
        const clientId = Number(req.params.clientId);
        const token = String(req.params.token || "").trim();

        if (!Number.isInteger(clientId) || clientId <= 0) {
          return res.status(400).json({ ok: false, error: "INVALID_CLIENT_ID" });
        }

        if (!token) {
          return res.status(400).json({ ok: false, error: "CLIENT_TOKEN_REQUIRED" });
        }

        const tokenHash = hashClientCabinetToken(token);

        const tokenRes = await db.query(
          `
          SELECT
            id,
            client_id,
            booking_id,
            token_last4,
            purpose,
            created_at
          FROM client_access_tokens
          WHERE client_id = $1
            AND token_hash = $2
            AND purpose = 'cabinet'
            AND revoked_at IS NULL
          LIMIT 1
          `,
          [clientId, tokenHash]
        );

        if (!tokenRes.rows.length) {
          return res.status(403).json({ ok: false, error: "INVALID_CLIENT_TOKEN" });
        }

        const clientRes = await db.query(
          `
          SELECT
            id,
            salon_id,
            name,
            phone,
            email,
            created_at
          FROM clients
          WHERE id = $1
          LIMIT 1
          `,
          [clientId]
        );

        if (!clientRes.rows.length) {
          return res.status(404).json({ ok: false, error: "CLIENT_NOT_FOUND" });
        }

        const bookingsRes = await db.query(
          `
          SELECT
            b.id,
            b.salon_id,
            b.salon_slug,
            salon.name AS salon_name,
            b.master_id,
            m.slug AS master_slug,
            m.name AS master_name,
            b.service_id,
            s.name AS service_name,
            b.start_at,
            b.end_at,
            b.status,
            b.price_snapshot,
            b.created_at
          FROM bookings b
          LEFT JOIN salons salon ON salon.id = b.salon_id
          LEFT JOIN masters m ON m.id = b.master_id
          LEFT JOIN services s ON s.id = b.service_id
          WHERE b.client_id = $1
          ORDER BY b.start_at DESC, b.id DESC
          `,
          [clientId]
        );

        const mastersRes = await db.query(
          `
          SELECT DISTINCT
            m.id,
            m.slug,
            m.name
          FROM bookings b
          JOIN masters m ON m.id = b.master_id
          WHERE b.client_id = $1
          ORDER BY m.name ASC
          `,
          [clientId]
        );

        const salonsRes = await db.query(
          `
          SELECT DISTINCT
            s.id,
            s.slug,
            s.name
          FROM bookings b
          JOIN salons s ON s.id = b.salon_id
          WHERE b.client_id = $1
          ORDER BY s.name ASC
          `,
          [clientId]
        );

        const statsRes = await db.query(
          `
          SELECT
            COUNT(*)::int AS bookings_total,
            COUNT(*) FILTER (WHERE status IN ('reserved', 'confirmed'))::int AS active_bookings,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_bookings,
            COUNT(*) FILTER (WHERE status IN ('canceled', 'cancelled'))::int AS cancelled_bookings,
            MAX(start_at) AS last_booking_at
          FROM bookings
          WHERE client_id = $1
          `,
          [clientId]
        );

        await db.query(
          `
          INSERT INTO client_audit_events (
            client_id,
            booking_id,
            actor_type,
            action,
            metadata
          )
          VALUES ($1, $2, 'client', 'cabinet_opened', $3)
          `,
          [
            clientId,
            tokenRes.rows[0].booking_id,
            {
              token_last4: tokenRes.rows[0].token_last4,
              source: "public_client_cabinet"
            }
          ]
        );

        return res.json({
          ok: true,
          client: clientRes.rows[0],
          bookings: bookingsRes.rows,
          masters: mastersRes.rows,
          salons: salonsRes.rows,
          stats: statsRes.rows[0] || {
            bookings_total: 0,
            active_bookings: 0,
            completed_bookings: 0,
            cancelled_bookings: 0,
            last_booking_at: null
          },
          personal_link: buildClientPersonalLink(clientId, token)
        });
      } catch (err) {
        console.error("PUBLIC_CLIENT_CABINET_ERROR", err);
        return res.status(500).json({ ok: false, error: "CLIENT_CABINET_FETCH_FAILED" });
      } finally {
        db.release();
      }
    }
  );

  /**
   * CLIENT MINI PROFILE UPDATE V1
   */
  r.patch(
    "/clients/:clientId/:token/profile",
    async (req, res) => {
      const db = await pool.connect();

      try {
        const clientId = Number(req.params.clientId);
        const token = String(req.params.token || "").trim();

        if (!Number.isInteger(clientId) || clientId <= 0) {
          return res.status(400).json({ ok: false, error: "INVALID_CLIENT_ID" });
        }

        if (!token) {
          return res.status(400).json({ ok: false, error: "CLIENT_TOKEN_REQUIRED" });
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, "phone")) {
          return res.status(400).json({ ok: false, error: "PHONE_LOCKED_IN_V1" });
        }

        const tokenHash = hashClientCabinetToken(token);

        const tokenRes = await db.query(
          `
          SELECT
            id,
            client_id,
            booking_id,
            token_last4,
            purpose,
            created_at
          FROM client_access_tokens
          WHERE client_id = $1
            AND token_hash = $2
            AND purpose = 'cabinet'
            AND revoked_at IS NULL
          LIMIT 1
          `,
          [clientId, tokenHash]
        );

        if (!tokenRes.rows.length) {
          return res.status(403).json({ ok: false, error: "INVALID_CLIENT_TOKEN" });
        }

        const existingClient = await db.query(
          `
          SELECT
            id,
            salon_id,
            name,
            phone,
            email,
            created_at
          FROM clients
          WHERE id = $1
          LIMIT 1
          `,
          [clientId]
        );

        if (!existingClient.rows.length) {
          return res.status(404).json({ ok: false, error: "CLIENT_NOT_FOUND" });
        }

        const currentClient = existingClient.rows[0];

        const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, "name");
        const hasEmail = Object.prototype.hasOwnProperty.call(req.body || {}, "email");

        if (!hasName && !hasEmail) {
          return res.status(400).json({ ok: false, error: "NO_PROFILE_FIELDS" });
        }

        const nextName = hasName
          ? String(req.body.name || "").trim()
          : currentClient.name;

        if (!nextName) {
          return res.status(400).json({ ok: false, error: "NAME_REQUIRED" });
        }

        const nextEmail = hasEmail
          ? String(req.body.email || "").trim() || null
          : currentClient.email;

        if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
          return res.status(400).json({ ok: false, error: "INVALID_EMAIL" });
        }

        const updated = await db.query(
          `
          UPDATE clients
          SET
            name = $2,
            email = $3
          WHERE id = $1
          RETURNING
            id,
            salon_id,
            name,
            phone,
            email,
            created_at
          `,
          [
            clientId,
            nextName,
            nextEmail
          ]
        );

        await db.query(
          `
          INSERT INTO client_audit_events (
            client_id,
            booking_id,
            actor_type,
            action,
            metadata
          )
          VALUES ($1, $2, 'client', 'profile_updated', $3)
          `,
          [
            clientId,
            tokenRes.rows[0].booking_id,
            {
              token_last4: tokenRes.rows[0].token_last4,
              changed_fields: {
                name: hasName,
                email: hasEmail
              },
              source: "public_client_cabinet"
            }
          ]
        );

        return res.json({
          ok: true,
          client: updated.rows[0],
          personal_link: buildClientPersonalLink(clientId, token)
        });
      } catch (err) {
        console.error("PUBLIC_CLIENT_PROFILE_UPDATE_ERROR", err);
        return res.status(500).json({ ok: false, error: "CLIENT_PROFILE_UPDATE_FAILED" });
      } finally {
        db.release();
      }
    }
  );

  return r;
}
