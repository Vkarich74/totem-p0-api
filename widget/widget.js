// TOTEM Booking Widget v3 (Odoo-ready, payments flow)
// Pure JS, no deps, iframe-safe

(function () {
  "use strict";

  if (window.TotemWidget) return;

  function log(msg, err) {
    try { console.log("[TOTEM WIDGET]", msg, err || ""); } catch (_) {}
  }
  function errLog(msg, err) {
    try { console.error("[TOTEM WIDGET]", msg, err || ""); } catch (_) {}
  }

  class TotemWidget {
    constructor(config) {
      if (!config || !config.baseUrl || !config.salonSlug) {
        throw new Error("baseUrl and salonSlug are required");
      }

      this.baseUrl = config.baseUrl.replace(/\/$/, "");
      this.salonSlug = config.salonSlug;

      this.state = {
        services: [],
        selected: null,
        bookingId: null,
        pollTimer: null,
      };

      this.mount();
      this.loadCatalog();
      this.handleReturn();
    }

    mount() {
      const root = document.getElementById("totem-widget");
      if (!root) {
        errLog("Root #totem-widget not found");
        return;
      }

      root.innerHTML = `
        <div style="font-family:Arial,sans-serif;max-width:360px">
          <div id="tw-services"></div>
          <button id="tw-book" disabled style="margin-top:10px">
            Book & Pay
          </button>
          <div id="tw-status" style="margin-top:8px;font-size:13px"></div>
        </div>
      `;

      document
        .getElementById("tw-book")
        .addEventListener("click", () => this.createBookingAndPay());
    }

    async loadCatalog() {
      this.setStatus("Loading services...");
      try {
        const res = await fetch(
          this.baseUrl +
            "/public/catalog?salon_slug=" +
            encodeURIComponent(this.salonSlug)
        );
        const json = await res.json();
        if (!json.services) throw new Error("CATALOG_FAILED");
        this.state.services = json.services;
        this.renderServices();
        this.setStatus("Select a service");
      } catch (e) {
        errLog("loadCatalog failed", e);
        this.setStatus("Failed to load services");
      }
    }

    renderServices() {
      const box = document.getElementById("tw-services");
      box.innerHTML = "";
      this.state.services.forEach((s, idx) => {
        const row = document.createElement("div");
        row.style.marginBottom = "6px";
        row.innerHTML = `
          <label>
            <input type="radio" name="tw-service" value="${idx}">
            ${s.name} — ${s.price} (${s.duration_min} min) [${s.master_slug}]
          </label>
        `;
        row.querySelector("input").addEventListener("change", () => {
          this.state.selected = s;
          document.getElementById("tw-book").disabled = false;
        });
        box.appendChild(row);
      });
    }

    async createBookingAndPay() {
      if (!this.state.selected) return;
      this.setStatus("Creating booking...");
      try {
        const res = await fetch(this.baseUrl + "/public/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            salon_slug: this.salonSlug,
            master_slug: this.state.selected.master_slug,
            service_id: this.state.selected.service_id,
            date: "2026-02-10",
            start_time: "12:10",
            request_id: "widget-" + Date.now(),
          }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error("BOOKING_FAILED");
        this.state.bookingId = json.booking_id;
        this.startPayment();
      } catch (e) {
        errLog("createBooking failed", e);
        this.setStatus("Booking failed");
      }
    }

    async startPayment() {
      this.setStatus("Redirecting to payment...");
      try {
        const res = await fetch(this.baseUrl + "/public/payments/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            booking_id: this.state.bookingId,
            return_url: window.location.href,
          }),
        });
        const json = await res.json();
        if (!json.ok || !json.payment_url) {
          throw new Error("PAYMENT_START_FAILED");
        }
        window.location.href = json.payment_url;
      } catch (e) {
        errLog("startPayment failed", e);
        this.setStatus("Payment start failed");
      }
    }

    handleReturn() {
      const params = new URLSearchParams(window.location.search);
      const bookingId = params.get("booking_id");
      if (!bookingId) return;
      this.state.bookingId = Number(bookingId);
      this.setStatus("Checking payment status...");
      this.startPolling();
    }

    startPolling() {
      if (this.state.pollTimer) return;
      this.state.pollTimer = setInterval(() => this.checkStatus(), 2000);
    }

    async checkStatus() {
      try {
        const res = await fetch(
          this.baseUrl +
            "/public/payments/status?booking_id=" +
            this.state.bookingId
        );
        const json = await res.json();
        if (!json.status) return;

        if (json.status === "paid" || json.status === "completed") {
          clearInterval(this.state.pollTimer);
          this.setStatus("Payment successful");
        } else if (json.status === "expired") {
          clearInterval(this.state.pollTimer);
          this.setStatus("Booking expired");
        } else if (json.status === "cancelled") {
          clearInterval(this.state.pollTimer);
          this.setStatus("Payment cancelled");
        } else {
          this.setStatus("Waiting for payment...");
        }
      } catch (e) {
        errLog("checkStatus failed", e);
      }
    }

    setStatus(text) {
      const el = document.getElementById("tw-status");
      if (el) el.textContent = text;
    }
  }

  window.TotemWidget = {
    init: function (config) {
      try { new TotemWidget(config); } catch (e) { errLog("Init failed", e); }
    },
  };
})();
