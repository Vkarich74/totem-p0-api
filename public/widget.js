// public/widget.js — TOTEM Booking Widget v1 + UI
// Pure JS, no deps, PROD-ready (Jan 2026)

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
        status: null,
        loading: false,
        error: null
      };

      this._mount();
    }

    // --------------------
    // UI
    // --------------------
    _mount() {
      const root = document.createElement("div");
      root.id = "totem-widget";
      root.innerHTML = `
        <style>
          #totem-widget {
            font-family: Arial, sans-serif;
            max-width: 320px;
            border: 1px solid #ddd;
            padding: 12px;
            border-radius: 8px;
          }
          #totem-widget button {
            width: 100%;
            padding: 10px;
            margin-top: 8px;
            cursor: pointer;
          }
          #totem-widget .status {
            margin-top: 8px;
            font-size: 13px;
          }
          #totem-widget .error {
            color: #c00;
          }
          #totem-widget .ok {
            color: #090;
          }
        </style>

        <div>
          <label>Date</label>
          <input id="tw-date" type="date" />
        </div>
        <div>
          <label>Start</label>
          <input id="tw-start" type="time" />
        </div>
        <div>
          <label>End</label>
          <input id="tw-end" type="time" />
        </div>

        <button id="tw-book">Book</button>
        <button id="tw-pay" disabled>Pay</button>
        <button id="tw-cancel" disabled>Cancel</button>

        <div class="status" id="tw-status"></div>
      `;

      document.currentScript.parentElement.appendChild(root);

      this.$date = root.querySelector("#tw-date");
      this.$start = root.querySelector("#tw-start");
      this.$end = root.querySelector("#tw-end");
      this.$status = root.querySelector("#tw-status");

      root.querySelector("#tw-book").onclick = () => this._onBook();
      root.querySelector("#tw-pay").onclick = () => this._onPay();
      root.querySelector("#tw-cancel").onclick = () => this._onCancel();

      this.$payBtn = root.querySelector("#tw-pay");
      this.$cancelBtn = root.querySelector("#tw-cancel");
    }

    _renderStatus(msg, type) {
      this.$status.className = "status " + (type || "");
      this.$status.textContent = msg || "";
    }

    // --------------------
    // HTTP
    // --------------------
    async request(method, path, body) {
      this.state.loading = true;
      this._renderStatus("Loading...");

      try {
        const res = await fetch(this.baseUrl + path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined
        });

        const json = await res.json();
        return json;
      } catch (e) {
        return { ok: false, error: "NETWORK_ERROR" };
      } finally {
        this.state.loading = false;
      }
    }

    // --------------------
    // Actions
    // --------------------
    async _onBook() {
      const date = this.$date.value;
      const start_time = this.$start.value;
      const end_time = this.$end.value;

      if (!date || !start_time || !end_time) {
        this._renderStatus("Fill all fields", "error");
        return;
      }

      const res = await this.request("POST", "/public/bookings", {
        salon_id: this.salonId,
        master_slug: this.masterSlug,
        service_id: this.serviceId,
        date,
        start_time,
        end_time,
        client: { name: "Client" }
      });

      if (res.ok) {
        this.state.bookingId = res.request_id;
        this.$payBtn.disabled = false;
        this.$cancelBtn.disabled = false;
        this._renderStatus("Booked. Awaiting payment.", "ok");
      } else if (res.error === "BOOKING_ALREADY_EXISTS") {
        this._renderStatus("Time slot already booked.", "error");
      } else {
        this._renderStatus(res.error || "Booking failed", "error");
      }
    }

    async _onPay() {
      if (!this.state.bookingId) return;

      const res = await this.request("POST", "/public/payments/intent", {
        request_id: this.state.bookingId,
        provider: "test",
        amount: 1000
      });

      if (res.ok) {
        this._renderStatus("Payment intent created.", "ok");
      } else {
        this._renderStatus(res.error || "Payment failed", "error");
      }
    }

    async _onCancel() {
      if (!this.state.bookingId) return;

      const res = await this.request(
        "POST",
        `/public/bookings/${this.state.bookingId}/cancel`
      );

      if (res.ok) {
        this._renderStatus("Booking cancelled.", "ok");
        this.$payBtn.disabled = true;
        this.$cancelBtn.disabled = true;
      } else {
        this._renderStatus(res.error || "Cancel failed", "error");
      }
    }
  }

  window.TotemWidget = TotemWidget;
})();
