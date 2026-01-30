// TOTEM Booking Widget v1.1
// Pure JS, no deps, sandbox-safe (Zoho / iframe compatible)

(function () {
  "use strict";

  if (window.TotemWidget) return;

  function safeError(msg, err) {
    try {
      console.error("[TOTEM WIDGET]", msg, err || "");
    } catch (_) {}
  }

  class TotemWidget {
    constructor(config) {
      if (!config || !config.baseUrl) {
        throw new Error("TotemWidget: baseUrl is required");
      }

      this.baseUrl = config.baseUrl.replace(/\/$/, "");
      this.salonSlug = config.salonSlug;
      this.masterSlug = config.masterSlug;
      this.serviceId = config.serviceId;

      this.state = {
        requestId: null,
        status: null,
        loading: false,
        error: null,
      };

      this.mount();
    }

    mount() {
      const root = document.getElementById("totem-widget");
      if (!root) {
        safeError("Root element #totem-widget not found");
        return;
      }

      root.innerHTML = `
        <div style="font-family:Arial,sans-serif;max-width:320px">
          <button id="totem-create">Create booking</button>
          <div id="totem-status" style="margin-top:8px"></div>
        </div>
      `;

      document
        .getElementById("totem-create")
        .addEventListener("click", () => this.createBooking());
    }

    async createBooking() {
      this.setStatus("loading...");

      try {
        const res = await fetch(this.baseUrl + "/public/bookings", {
          method: "POST",
          mode: "cors",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            salon_slug: this.salonSlug,
            master_slug: this.masterSlug,
            service_id: this.serviceId,
            date: "2026-01-27",
            start_time: "14:00",
          }),
        });

        const json = await res.json();

        if (!json.ok) {
          throw new Error(json.error || "BOOKING_FAILED");
        }

        this.state.requestId = json.request_id;
        this.state.status = json.status;
        this.setStatus("OK: " + json.status);
      } catch (err) {
        this.setStatus("ERROR");
        safeError("createBooking failed", err);
      }
    }

    setStatus(text) {
      const el = document.getElementById("totem-status");
      if (el) el.textContent = text;
    }
  }

  window.TotemWidget = {
    init: function (config) {
      try {
        new TotemWidget(config);
      } catch (e) {
        safeError("Init failed", e);
      }
    },
  };
})();
