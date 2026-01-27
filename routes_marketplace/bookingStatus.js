// routes_marketplace/bookingStatus.js (ESM)
// STEP 26.7 — tenant + ACL for booking status

import updateBookingStatus from "../helpers/updateBookingStatus.js";
import { requireRoles, requireMasterSelf } from "../middleware/acl.js";

function getTenantId(req) {
  const t = req.headers["x-tenant-id"];
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function loadBooking(db, bookingId) {
  return db
    .prepare(
      `SELECT
         id,
         salon_id,
         master_id,
         date,
         start_time,
         end_time,
         active,
         cancelled_at,
         cancel_reason,
         service_id,
         source
       FROM bookings
       WHERE id = ?`
    )
    .get(bookingId);
}

function enforceTenant(req, booking) {
  const tenantId = getTenantId(req);
  if (!tenantId) return { ok: false, status: 400, error: "TENANT_REQUIRED" };
  if (Number(booking.salon_id) !== tenantId) {
    return { ok: false, status: 403, error: "CROSS_TENANT_FORBIDDEN" };
  }
  return { ok: true };
}

export function registerBookingStatusRoutes(app, db) {
  /**
   * POST /marketplace/booking/status
   * Roles: owner | staff | master(self)
   */
  app.post(
    "/marketplace/booking/status",
    requireRoles(["owner", "staff", "master"]),
    (req, res, next) => {
      try {
        const { bookingId, newStatus } = req.body;
        if (!bookingId || !newStatus) {
          return res.status(400).json({
            ok: false,
            error: "bookingId and newStatus are required",
          });
        }

        const booking = loadBooking(db, Number(bookingId));
        if (!booking) {
          return res.status(404).json({ ok: false, error: "BOOKING_NOT_FOUND" });
        }

        // expose booking to next middleware
        req.booking = booking;

        const tcheck = enforceTenant(req, booking);
        if (!tcheck.ok) {
          return res.status(tcheck.status).json({ ok: false, error: tcheck.error });
        }

        next();
      } catch (e) {
        return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
      }
    },
    requireMasterSelf(),
    (req, res) => {
      try {
        const { bookingId, newStatus } = req.body;

        const actor = {
          type: req.headers["x-actor-type"] || "system",
          id: req.headers["x-actor-id"]
            ? Number(req.headers["x-actor-id"])
            : null,
        };

        const result = updateBookingStatus(
          db,
          Number(bookingId),
          newStatus,
          actor
        );

        return res.json({
          ok: true,
          bookingId: Number(bookingId),
          from: result.from,
          to: result.to,
          actor,
        });
      } catch (err) {
        if (
          err.code === "INVALID_STATUS" ||
          err.code === "STATUS_ALREADY_SET" ||
          err.code === "BOOKING_ALREADY_CANCELLED"
        ) {
          return res.status(409).json({ ok: false, error: err.code });
        }
        if (
          err.code === "FORBIDDEN_COMPLETED" ||
          err.code === "FORBIDDEN_NOT_OWNER"
        ) {
          return res.status(403).json({ ok: false, error: err.code });
        }
        if (err.code === "COMMISSION_REQUIRED") {
          return res.status(409).json({ ok: false, error: err.code });
        }
        console.error(err);
        return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
      }
    }
  );

  /**
   * GET /marketplace/booking/:id
   * Roles: owner | staff | master(self)
   */
  app.get(
    "/marketplace/booking/:id",
    requireRoles(["owner", "staff", "master"]),
    (req, res, next) => {
      const booking = loadBooking(db, Number(req.params.id));
      if (!booking) {
        return res.status(404).json({ ok: false, error: "BOOKING_NOT_FOUND" });
      }
      req.booking = booking;

      const tcheck = enforceTenant(req, booking);
      if (!tcheck.ok) {
        return res.status(tcheck.status).json({ ok: false, error: tcheck.error });
      }
      next();
    },
    requireMasterSelf(),
    (req, res) => {
      res.json({ ok: true, booking: req.booking });
    }
  );
}
