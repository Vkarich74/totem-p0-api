// TOTEM Booking Widget v1.2
// Pure JS, no deps, Zoho / iframe safe

(function () {
  "use strict";

  // prevent double init
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

      this.baseUrl = String(config.baseUrl).replace(/\/$/, "");
      this.publicToken = config.publicToken ? String(config.publicToken) : null;

      this.salonSlug = config.salonSlug ? String(config.salonSlug) : null;
      this.masterSlug = config.masterSlug ? String(config.masterSlug) : null;
      this.serviceId = config.serviceId ? String(config.serviceId) : null;

      this.date = config.date ? String(config.date) : null;
      this.startTime = config.startTime ? String(config.startTime) : null;

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
          <div id="totem-status" style="margin-top:8px;font-size:12px;"></div>
        </div>
      `;

      const btn = document.getElementById("totem-create");
      if (btn) btn.addEventListener("click", () => this.createBooking());
    }

    async createBooking() {
      this.setStatus("loading...");

      const payload = {
        salon_slug: this.salonSlug,
        master_slug: this.masterSlug,
        service_id: this.serviceId,
        date: this.date,
        start_time: this.startTime,
      };

      try {
        const headers = {
          "Content-Type": "application/json",
        };

        if (this.publicToken) {
          headers["X-Public-Token"] = this.publicToken;
        }

        const res = await fetch(this.baseUrl + "/public/bookings", {
          method: "POST",
          mode: "cors",
          headers,
          body: JSON.stringify(payload),
        });

        const text = await res.text();
        let json;

        try {
          json = JSON.parse(text);
        } catch (_) {
          this.setStatus("ERROR: INVALID_JSON_RESPONSE");
          return;
        }

        if (!res.ok || !json.ok) {
          this.handleError(res.status, json && json.error ? json.error : "BOOKING_FAILED");
          return;
        }

        this.setStatus("OK: " + String(json.status || "OK"));
      } catch (err) {
        this.setStatus("ERROR");
        safeError("createBooking failed", err);
      }
    }

    handleError(status, code) {
      if (status === 401) return this.setStatus("ERROR: INVALID_PUBLIC_TOKEN");
      if (status === 403) return this.setStatus("ERROR: SALON_TOKEN_MISMATCH");
      if (status === 429) return this.setStatus("ERROR: RATE_LIMIT_EXCEEDED");
      this.setStatus("ERROR: " + String(code || "UNKNOWN_ERROR"));
    }

    setStatus(text) {
      const el = document.getElementById("totem-status");
      if (el) el.textContent = text;
    }
  }

  // public init
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
