// sdk/totem-sdk.js
// TOTEM Public SDK (v1) — Freeze
// ESM, no dependencies

export class TotemSDK {
  constructor(opts = {}) {
    const baseUrl = String(opts.baseUrl || "").replace(/\/+$/, "");
    if (!baseUrl) throw new Error("TotemSDK: baseUrl is required");

    this.baseUrl = baseUrl;
    this.timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 15000;

    // reserved headers (optional)
    this.publicToken = opts.publicToken ? String(opts.publicToken) : "";
    this.bearerToken = opts.bearerToken ? String(opts.bearerToken) : "";
  }

  setPublicToken(token) {
    this.publicToken = token ? String(token) : "";
  }

  setBearerToken(token) {
    this.bearerToken = token ? String(token) : "";
  }

  async health() {
    return this._request("GET", "/health");
  }

  async createBooking(payload) {
    return this._request("POST", "/public/bookings", payload);
  }

  async createPaymentIntent(payload) {
    return this._request("POST", "/public/payments/intent", payload);
  }

  async _request(method, path, body) {
    const url = this.baseUrl + path;

    const headers = { "Content-Type": "application/json" };
    if (this.publicToken) headers["X-Public-Token"] = this.publicToken;
    if (this.bearerToken) headers["Authorization"] = `Bearer ${this.bearerToken}`;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });

      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { ok: false, error: "NON_JSON_RESPONSE", raw: text };
      }

      if (!res.ok) {
        const err = new Error(`HTTP_${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
      }

      return data;
    } finally {
      clearTimeout(t);
    }
  }
}
