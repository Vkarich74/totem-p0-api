// routes_public/sdk.js
import express from "express";

/**
 * GO 27.4 — Public JS SDK
 * GET /public/sdk.js
 *
 * Отдаём ESM модуль (browser import).
 * Важно: этот роут должен быть ДО security middleware.
 */

const SDK_JS = `
// TOTEM Public SDK (ESM) — GO 27.4
// Usage:
// import { createTotemClient } from "https://YOUR_API/public/sdk.js";

function normalizeError(status, data) {
  const err = new Error((data && (data.error || data.message)) || "REQUEST_FAILED");
  err.status = status;
  err.code = (data && data.error) || "REQUEST_FAILED";
  err.details = data || null;
  return err;
}

async function request(baseUrl, path, { method = "GET", token, json, headers = {} } = {}) {
  const url = baseUrl.replace(/\\/$/, "") + path;
  const h = { ...headers };

  if (token) h["Authorization"] = "Bearer " + token;
  if (json !== undefined) h["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers: h,
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

export function createTotemClient({ baseUrl, publicToken }) {
  if (!baseUrl) throw new Error("baseUrl is required");
  if (!publicToken) throw new Error("publicToken is required");

  const token = publicToken;

  return {
    // GET /public/salons/:salon_id/availability?date=YYYY-MM-DD&duration_min=60&master_slug=...
    async getAvailability({ salonId, date, durationMin, masterSlug } = {}) {
      if (!salonId) throw new Error("salonId is required");
      if (!date) throw new Error("date is required (YYYY-MM-DD)");

      const q = new URLSearchParams();
      q.set("date", String(date));
      if (durationMin !== undefined && durationMin !== null) q.set("duration_min", String(durationMin));
      if (masterSlug) q.set("master_slug", String(masterSlug));

      return request(baseUrl, "/public/salons/" + encodeURIComponent(String(salonId)) + "/availability?" + q.toString(), {
        method: "GET",
        token,
      });
    },

    // POST /public/bookings
    async createBooking({ salonId, masterSlug, date, startTime, endTime, client, idempotencyKey } = {}) {
      if (!salonId) throw new Error("salonId is required");
      if (!masterSlug) throw new Error("masterSlug is required");
      if (!date) throw new Error("date is required (YYYY-MM-DD)");
      if (!startTime) throw new Error("startTime is required (HH:MM)");
      if (!endTime) throw new Error("endTime is required (HH:MM)");
      if (!client || !client.name) throw new Error("client.name is required");

      const headers = {};
      if (idempotencyKey) headers["Idempotency-Key"] = String(idempotencyKey);

      return request(baseUrl, "/public/bookings", {
        method: "POST",
        token,
        headers,
        json: {
          salon_id: String(salonId),
          master_slug: String(masterSlug),
          date: String(date),
          start_time: String(startTime),
          end_time: String(endTime),
          client: {
            name: String(client.name),
            phone: client.phone ? String(client.phone) : undefined,
          },
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
    res.setHeader("Cache-Control", "public, max-age=300"); // 5 min
    res.send(SDK_JS);
  });

  app.use("/public", router);
}
