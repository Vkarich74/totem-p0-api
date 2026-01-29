// widget/widget.js — TOTEM Booking Widget v1
// Pure JS, PROD-ready, Jan 2026

(function () {
  if (window.TotemWidget) return;

  class TotemWidget {
    constructor(config) {
      if (!config || !config.baseUrl) {
        throw new Error("TotemWidget: baseUrl is required");
      }

      this.baseUrl = config.baseUrl.replace(/\/$/, "");
      this.salonId = config.salonId;
      this.masterSlug = config.masterSlug;
      this.serviceId = config.serviceId;

      this.state = {
        bookingId: null,
        status: null
      };
    }

    async request(method, path, body) {
      const res = await fetch(this.baseUrl + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });

      return res.json();
    }

    async createBooking({ date, start_time, end_time, client }) {
      const res = await this.request("POST", "/public/bookings", {
        salon_id: this.salonId,
        master_slug: this.masterSlug,
        service_id: this.serviceId,
        date,
        start_time,
        end_time,
        client
      });

      if (res.ok) {
        this.state.bookingId = res.request_id;
        this.state.status = res.status;
      }

      return res;
    }

    async pay({ provider, amount }) {
      if (!this.state.bookingId) {
        return { ok: false, error: "NO_BOOKING" };
      }

      return this.request("POST", "/public/payments/intent", {
        request_id: this.state.bookingId,
        provider,
        amount
      });
    }

    async cancel() {
      if (!this.state.bookingId) {
        return { ok: false, error: "NO_BOOKING" };
      }

      return this.request(
        "POST",
        `/public/bookings/${this.state.bookingId}/cancel`
      );
    }
  }

  window.TotemWidget = TotemWidget;
})();
