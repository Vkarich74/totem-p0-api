// widget/totem-widget.js
// TOTEM Booking Widget (v1) — Freeze
// Vanilla JS, no deps, embed-ready

import { TotemSDK } from "../sdk/totem-sdk.js";

(function () {
  function el(tag, attrs = {}) {
    const n = document.createElement(tag);
    for (const k in attrs) {
      if (k === "text") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    return n;
  }

  function mount(target, opts = {}) {
    const root =
      typeof target === "string" ? document.querySelector(target) : target;
    if (!root) throw new Error("TotemWidget: target not found");

    const sdk = new TotemSDK({
      baseUrl: opts.baseUrl
    });

    const box = el("div", { style: "border:1px solid #ccc;padding:12px;max-width:360px;font-family:sans-serif" });
    const title = el("div", { text: "TOTEM Booking", style: "font-weight:bold;margin-bottom:8px" });
    const status = el("div", { style: "margin:6px 0;color:#333" });

    const name = el("input", { placeholder: "Client name", style: "width:100%;margin-bottom:6px" });
    const date = el("input", { type: "date", style: "width:100%;margin-bottom:6px" });
    const start = el("input", { type: "time", style: "width:100%;margin-bottom:6px" });
    const end = el("input", { type: "time", style: "width:100%;margin-bottom:6px" });

    const btn = el("button", { text: "Book", style: "width:100%;padding:8px" });

    box.append(title, status, name, date, start, end, btn);
    root.innerHTML = "";
    root.appendChild(box);

    btn.onclick = async () => {
      status.textContent = "Creating booking…";

      try {
        const booking = await sdk.createBooking({
          salon_id: opts.salon_id,
          master_slug: opts.master_slug,
          service_id: opts.service_id,
          date: date.value,
          start_time: start.value,
          end_time: end.value,
          client: { name: name.value || "Client" }
        });

        status.textContent =
          "OK. request_id=" + booking.request_id + ", price=" + booking.price;

        const intent = await sdk.createPaymentIntent({
          request_id: booking.request_id,
          provider: "test",
          amount: booking.price
        });

        status.textContent += " | payment intent OK";
      } catch (e) {
        status.textContent = "Error: " + e.message;
      }
    };
  }

  window.TotemWidget = { mount };
})();
