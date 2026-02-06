import express from "express";

/**
 * TOTEM Public SDK — CANONICAL v1
 * MATCHES REAL PUBLIC API (2026-02)
 */

const SDK_JS = `
// TOTEM Public SDK (ESM) — CANONICAL v1
// Usage:
// import { createTotemClient } from "https://totem-p0-api-production.up.railway.app/public/sdk.js";

function normalizeError(status, data) {
  const err = new Error((data && (data.error || data.message)) || "REQUEST_FAILED");
  err.status = status;
  err.code = (data && data.error) || "REQUEST_FAILED";
  err.details = data || null;
  return err;
}

async function request(baseUrl, path, { method = "GET", json } = {}) {
  const url = baseUrl.replace(/\\/$/, "") + path;

  const headers = {};
  if (json !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    data = await res.json().catch(() => null);
  } else {
    const text = await res.text().catch(() => "");
    data = text ? { message: text } : null;
  }

  if (!res.ok) throw normalizeError(res.status, data);
  return data;
}

export function createTotemClient({ baseUrl }) {
  if (!baseUrl) throw new Error("baseUrl is required");

  return {
    // GET /public/availability
    async getAvailability({ salon_slug, master_slug, service_id, date }) {
      if (!salon_slug || !master_slug || !service_id || !date) {
        throw new Error("salon_slug, master_slug, service_id, date are required");
      }

      const q = new URLSearchParams({
        salon_slug,
        master_slug,
        service_id,
        date,
      });

      return request(baseUrl, "/public/availability?" + q.toString());
    },

    // POST /public/booking/create
    async createBooking({ salon_slug, master_slug, service_id, date, start_time, request_id }) {
      if (!salon_slug || !master_slug || !service_id || !date || !start_time) {
        throw new Error("missing required booking fields");
      }

      return request(baseUrl, "/public/booking/create", {
        method: "POST",
        json: {
          salon_slug,
          master_slug,
          service_id,
          date,
          start_time,
          request_id,
        },
      });
    },

    // GET /public/booking/:id/result
    async getBookingResult({ booking_id }) {
      if (!booking_id) throw new Error("booking_id is required");
      return request(baseUrl, "/public/booking/" + booking_id + "/result");
    },

    // POST /public/booking/:id/cancel
    async cancelBooking({ booking_id }) {
      if (!booking_id) throw new Error("booking_id is required");
      return request(baseUrl, "/public/booking/" + booking_id + "/cancel", {
        method: "POST",
      });
    },

    // POST /public/payments/intent
    async createPaymentIntent({ booking_id, provider, amount }) {
      if (!booking_id || !provider || !amount) {
        throw new Error("booking_id, provider, amount are required");
      }

      return request(baseUrl, "/public/payments/intent", {
        method: "POST",
        json: {
          booking_id,
          provider,
          amount,
        },
      });
    },
  };
}
`.trimStart();

export default function mountPublicSdk(app) {
  const router = express.Router();

  router.get("/sdk.js", (req, res) => {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(SDK_JS);
  });

  app.use("/public", router);
}
