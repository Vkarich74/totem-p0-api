// public/widget.js — TOTEM Widget (PROD HARDENED)
// - Pure JS
// - Contract-driven
// - No payments inside widget
// - Source of truth: /public/bookings/:id/result
// - Statuses: pending_payment | paid | cancelled

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
      crypto.randomUUID?.() ||
      Math.random().toString(36).slice(2) + Date.now().toString(36)
    );
  }

  async function fetchJSON(url, opts = {}, attempt = 1) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        ...opts,
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const err = new Error(data.error || "REQUEST_FAILED");
        err.status = res.status;
        throw err;
      }

      return data;
    } catch (err) {
      if (
        attempt < MAX_RETRIES &&
        (err.name === "AbortError" ||
          !err.status ||
          err.status >= 500 ||
          err.status === 429)
      ) {
        await sleep(300 * attempt);
        return fetchJSON(url, opts, attempt + 1);
      }
      throw err;
    } finally {
      clearTimeout(id);
    }
  }

  async function pollResult({ baseUrl, bookingId }) {
    const startedAt = Date.now();

    while (true) {
      const result = await fetchJSON(
        `${baseUrl}/public/bookings/${bookingId}/result`
      );

      if (result.status === "paid" || result.status === "cancelled") {
        return result;
      }

      if (Date.now() - startedAt > MAX_WAIT_MS) {
        throw new Error("WAIT_TIMEOUT");
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

      const bookingId = booking.booking_id;
      if (!bookingId) throw new Error("NO_BOOKING_ID");

      setStatus("Waiting for payment confirmation...");

      const result = await pollResult({ baseUrl, bookingId });

      if (result.status === "paid") {
        setStatus("✅ Booking confirmed.");
        return;
      }

      if (result.status === "cancelled") {
        setStatus("❌ Booking cancelled.");
        return;
      }

      setStatus("Unknown final state.");
    } catch (err) {
      if (err.message === "WAIT_TIMEOUT") {
        setStatus("⏳ Payment is still processing. Please refresh later.");
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

      setStatus("Error: " + err.message);
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
