// public/widget.js — TOTEM Widget (PROD HARDENED)
// - Pure JS
// - Contract-driven
// - No payments inside widget
// - Source of truth: /public/bookings/:id/result
// - Final statuses: paid | cancelled | expired
// - Handles: 409/429/timeouts/network gracefully

(function () {
  const POLL_INTERVAL_MS = 2000;
  const MAX_WAIT_MS = 30000;
  const REQUEST_TIMEOUT_MS = 10000;
  const MAX_RETRIES = 3;

  let locked = false;

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(text) {
    const el = $("totem-status");
    if (el) el.textContent = text;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function uuid() {
    return (
      (typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID()) ||
      Math.random().toString(36).slice(2) + Date.now().toString(36)
    );
  }

  async function fetchJSON(url, opts = {}, attempt = 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const err = new Error(data?.error || "REQUEST_FAILED");
        err.status = res.status;
        err.payload = data;
        throw err;
      }

      return data;
    } catch (err) {
      const retryable =
        err.name === "AbortError" ||
        !err.status ||
        err.status >= 500 ||
        err.status === 429;

      if (attempt < MAX_RETRIES && retryable) {
        await sleep(300 * attempt);
        return fetchJSON(url, opts, attempt + 1);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function normalizeResult(result) {
    // Contract: final (boolean), booking_status (string)
    // Backward-safe: if backend ever returns status instead, map it.
    const booking_status = result.booking_status || result.status;
    const final =
      typeof result.final === "boolean"
        ? result.final
        : booking_status === "paid" ||
          booking_status === "cancelled" ||
          booking_status === "expired";

    return { final, booking_status };
  }

  async function pollResult({ baseUrl, bookingId }) {
    const startedAt = Date.now();

    while (true) {
      const raw = await fetchJSON(
        `${baseUrl}/public/bookings/${bookingId}/result`
      );

      const { final, booking_status } = normalizeResult(raw);

      if (final === true) {
        return { booking_status, raw };
      }

      if (Date.now() - startedAt > MAX_WAIT_MS) {
        const e = new Error("WAIT_TIMEOUT");
        e.code = "WAIT_TIMEOUT";
        throw e;
      }

      await sleep(POLL_INTERVAL_MS);
    }
  }

  async function startFlow({ baseUrl }) {
    if (locked) return;
    locked = true;

    try {
      setStatus("Creating booking...");

      const booking = await fetchJSON(`${baseUrl}/public/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salon_slug: "totem-demo-salon",
          master_slug: "test-master",
          service_id: "srv1",
          date: "2026-02-10",
          start_time: "12:00",
          request_id: uuid(),
        }),
      });

      const bookingId = booking.booking_id || booking.id;
      if (!bookingId) throw new Error("NO_BOOKING_ID");

      setStatus("Waiting for payment confirmation...");

      const result = await pollResult({ baseUrl, bookingId });

      if (result.booking_status === "paid") {
        setStatus("✅ Booking confirmed.");
        return;
      }

      if (result.booking_status === "expired") {
        setStatus("⏰ Booking expired. Please try again.");
        return;
      }

      if (result.booking_status === "cancelled") {
        setStatus("❌ Booking cancelled.");
        return;
      }

      // Should not happen, but keep safe UX
      setStatus("⚠️ Unexpected final state. Please contact support.");
    } catch (err) {
      if (err.code === "WAIT_TIMEOUT" || err.message === "WAIT_TIMEOUT") {
        setStatus("⌛ Still processing. Please refresh in a moment.");
        return;
      }

      if (err.status === 409) {
        setStatus("⚠️ Slot is no longer available.");
        return;
      }

      if (err.status === 429) {
        setStatus("⏳ Too many requests. Please wait and retry.");
        return;
      }

      if (err.name === "AbortError") {
        setStatus("⚠️ Network timeout. Please retry.");
        return;
      }

      setStatus("Error: " + (err.message || String(err)));
    } finally {
      locked = false;
    }
  }

  window.TotemWidget = {
    init({ baseUrl }) {
      if (!baseUrl) throw new Error("baseUrl required");

      const root = document.createElement("div");
      root.innerHTML = `
        <div style="border:1px solid #ddd;padding:12px;font-family:sans-serif">
          <button id="totem-start">Start booking</button>
          <div id="totem-status" style="margin-top:8px"></div>
        </div>
      `;
      document.body.appendChild(root);

      $("totem-start").addEventListener("click", () => {
        startFlow({ baseUrl });
      });
    },
  };
})();
