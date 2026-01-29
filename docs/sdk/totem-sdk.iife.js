(function () {
  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  function joinUrl(base, path) {
    if (!base) return path;
    return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
  }

  async function jsonFetch(url, options) {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options && options.headers ? options.headers : {}),
      },
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || `HTTP_${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  function createClient(opts) {
    assert(opts && opts.apiBase, "TotemSDK: apiBase is required");
    const apiBase = opts.apiBase;

    return {
      apiBase,

      health: async function () {
        return jsonFetch(joinUrl(apiBase, "/health"), { method: "GET" });
      },

      createBooking: async function (payload) {
        return jsonFetch(joinUrl(apiBase, "/public/bookings"), {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },

      createIntent: async function (payload) {
        return jsonFetch(joinUrl(apiBase, "/public/payments/intent"), {
          method: "POST",
          body: JSON.stringify(payload),
        });
      },
    };
  }

  window.TotemSDK = {
    createClient,
  };
})();
