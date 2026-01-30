// public/widget.js — TOTEM Widget v2 (FINAL RESULT AWARE)
// - Pure JS
// - No assumptions
// - Source of truth: /public/bookings/:id/result
// - Redirect / UX strictly by booking_status

(function () {
  const DEFAULT_POLL_INTERVAL = 2000; // 2 sec
  const MAX_WAIT_MS = 30000; // 30 sec

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

  async function fetchJSON(url, opts = {}) {
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error || "REQUEST_FAILED");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function pollResult({ baseUrl, bookingId }) {
    const startedAt = Date.now();

    while (true) {
      const result = await fetchJSON(
        `${baseUrl}/public/bookings/${bookingId}/result`
      );

      if (result.final === true) {
        return result;
      }

      if (Date.now() - startedAt > MAX_WAIT_MS) {
        throw new Error("WAIT_TIMEOUT");
      }

      await sleep(DEFAULT_POLL_INTERVAL);
    }
  }

  async function startFlow({ baseUrl }) {
    try {
      setStatus("Creating booking...");

      // 1️⃣ create booking
      const booking = await fetchJSON(`${baseUrl}/public/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salon_id: "s1",
          master_slug: "test-master",
          service_id: "srv1",
          date: "2026-02-01",
          start_time: "12:00",
          end_time: "13:00",
          client: { name: "Test" },
        }),
      });

      const bookingId = booking.booking_id || booking.id;
      if (!bookingId) throw new Error("NO_BOOKING_ID");

      setStatus(`Booking created (#${bookingId}). Creating payment...`);

      // 2️⃣ payment intent
      const intent = await fetchJSON(`${baseUrl}/public/payments/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: bookingId,
          provider: "mock",
          amount: booking.price || 1000,
        }),
      });

      setStatus("Payment initiated. Waiting for result...");

      // 3️⃣ wait for final result
      const result = await pollResult({ baseUrl, bookingId });

      // 4️⃣ final UX / redirect
      if (result.booking_status === "paid") {
        setStatus("✅ Payment successful. Booking confirmed.");
        // window.location.href = "/success.html";
        return;
      }

      if (result.booking_status === "expired") {
        setStatus("⏰ Booking expired. Please try again.");
        // window.location.href = "/expired.html";
        return;
      }

      if (result.booking_status === "cancelled") {
        setStatus("❌ Booking cancelled.");
        // window.location.href = "/cancelled.html";
        return;
      }

      setStatus("Unknown final state.");
    } catch (err) {
      if (err.message === "WAIT_TIMEOUT") {
        setStatus("Waiting for payment confirmation...");
        return;
      }
      setStatus("Error: " + err.message);
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
