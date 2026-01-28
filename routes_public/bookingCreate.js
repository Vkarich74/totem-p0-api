// routes_public/bookingCreate.js
import express from "express";
import crypto from "crypto";
import {
  publicCors,
  publicTokenAuth,
  publicRateLimit,
} from "../middleware/publicTokenAuth.js";

/**
 * GO 27 / B2 — Public booking REQUEST with pricing
 */

function bad(res, code, msg) {
  return res.status(code).json({ error: msg });
}

function isTime(t) {
  return typeof t === "string" && /^\d{2}:\d{2}$/.test(t);
}

export default function mountPublicBookingCreate(app, { db }) {
  const router = express.Router();

  router.use(publicCors);
  router.use(publicTokenAuth({ db, requiredScope: "public:book" }));
  router.use(publicRateLimit({ windowSec: 60, limit: 60 }));

  router.post("/bookings", (req, res) => {
    const {
      salon_id,
      master_slug,
      service_id,
      date,
      start_time,
      end_time,
      client,
    } = req.body || {};

    if (!salon_id) return bad(res, 400, "SALON_ID_REQUIRED");
    if (!master_slug) return bad(res, 400, "MASTER_REQUIRED");
    if (!service_id) return bad(res, 400, "SERVICE_REQUIRED");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return bad(res, 400, "DATE_REQUIRED");
    if (!isTime(start_time) || !isTime(end_time))
      return bad(res, 400, "TIME_REQUIRED");
    if (!client?.name) return bad(res, 400, "CLIENT_NAME_REQUIRED");

    if (req.public.salon_id && req.public.salon_id !== salon_id) {
      return bad(res, 403, "SALON_MISMATCH");
    }

    // ---- load service pricing (canonical) ----
    const svc = db
      .prepare(
        `
        SELECT id, duration_min, price
        FROM services
        WHERE id = ? AND salon_id = ?
      `
      )
      .get(service_id, salon_id);

    if (!svc) return bad(res, 404, "SERVICE_NOT_FOUND");

    const idemKey =
      req.headers["idempotency-key"] ||
      crypto.createHash("sha256").update(JSON.stringify(req.body)).digest("hex");

    const existing = db
      .prepare(
        `SELECT request_id FROM public_idempotency
         WHERE token_id = ? AND idem_key = ?`
      )
      .get(req.public.token_id, idemKey);

    if (existing) {
      return res.json({
        ok: true,
        request_id: existing.request_id,
        idempotent: true,
      });
    }

    const r = db
      .prepare(
        `
        INSERT INTO public_booking_requests (
          tenant_id, salon_id, master_slug,
          service_id, duration_min, price,
          date, start_time, end_time,
          client_name, client_phone,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        req.public.tenant_id,
        salon_id,
        master_slug,
        service_id,
        svc.duration_min,
        svc.price,
        date,
        start_time,
        end_time,
        client.name,
        client.phone || null,
        new Date().toISOString()
      );

    db.prepare(
      `
      INSERT INTO public_idempotency (token_id, idem_key, request_id, created_at)
      VALUES (?, ?, ?, ?)
    `
    ).run(
      req.public.token_id,
      idemKey,
      r.lastInsertRowid,
      new Date().toISOString()
    );

    return res.json({
      ok: true,
      request_id: r.lastInsertRowid,
      price: svc.price,
      duration_min: svc.duration_min,
      status: "pending_payment",
    });
  });

  app.use("/public", router);
}
