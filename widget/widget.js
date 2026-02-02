// TOTEM Booking Widget v2 (Odoo-ready)
// Pure JS, no deps, iframe-safe

(function () {
  "use strict";

  if (window.TotemWidget) return;

  function log(msg, err) {
    try {
      console.log("[TOTEM WIDGET]", msg, err || "");
    } catch (_) {}
  }

  function errLog(msg, err) {
    try {
      console.error("[TOTEM WIDGET]", msg, err || "");
    } catch (_) {}
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
      };

      this.mount();
      this.loadCatalog();
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
            Book selected service
          </button>
          <div id="tw-status" style="margin-top:8px;font-size:13px"></div>
        </div>
      `;

      document
        .getElementById("tw-book")
        .addEventListener("click", () => this.createBooking());
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
            ${s.name} — ${s.price} (${s.duration_min} min)
            [${s.master_slug}]
          </label>
        `;

        row.querySelector("input").addEventListener("change", () => {
          this.state.selected = s;
          document.getElementById("tw-book").disabled = false;
        });

        box.appendChild(row);
      });
    }

    async createBooking() {
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
            start_time: "12:00",
          }),
        });

        const json = await res.json();
        if (!json.ok) throw new Error("BOOKING_FAILED");

        this.setStatus("Booking created: " + json.status);
      } catch (e) {
        errLog("createBooking failed", e);
        this.setStatus("Booking failed");
      }
    }

    setStatus(text) {
      const el = document.getElementById("tw-status");
      if (el) el.textContent = text;
    }
  }

  window.TotemWidget = {
    init: function (config) {
      try {
        new TotemWidget(config);
      } catch (e) {
        errLog("Init failed", e);
      }
    },
  };
})();
