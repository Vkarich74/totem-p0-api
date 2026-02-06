(function () {
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        if (k === "class") n.className = attrs[k];
        else if (k === "html") n.innerHTML = attrs[k];
        else n.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach((c) => n.appendChild(c));
    return n;
  }

  function text(s) {
    return document.createTextNode(String(s));
  }

  function $(root, sel) {
    return root.querySelector(sel);
  }

  function mount(cfg) {
    if (!cfg || !cfg.target) throw new Error("TotemWidget.mount: target is required");
    if (!cfg.apiBase) throw new Error("TotemWidget.mount: apiBase is required");
    if (!cfg.salonId) throw new Error("TotemWidget.mount: salonId is required");

    if (!window.TotemSDK || !window.TotemSDK.createClient) {
      throw new Error("TotemWidget: TotemSDK not loaded");
    }

    const client = window.TotemSDK.createClient({ apiBase: cfg.apiBase });

    const host =
      typeof cfg.target === "string" ? document.querySelector(cfg.target) : cfg.target;

    if (!host) throw new Error("TotemWidget.mount: target not found");

    host.innerHTML = "";
    const box = el("div", { class: "totem-box" });

    const style = el("style", {
      html: `
.totem-box{max-width:720px;margin:0 auto;padding:16px}
.totem-row{display:flex;gap:12px;flex-wrap:wrap}
.totem-row > div{flex:1;min-width:160px}
.totem-label{display:block;font-size:12px;margin:10px 0 6px;color:#333}
.totem-input{width:100%;padding:10px;border:1px solid #ccc;border-radius:8px}
.totem-btn{padding:10px 12px;border:0;border-radius:10px;cursor:pointer}
.totem-btn.primary{background:#111;color:#fff}
.totem-btn.secondary{background:#eee}
.totem-log{margin-top:12px;padding:10px;border:1px solid #eee;border-radius:10px;background:#fafafa;font-family:ui-monospace, SFMono-Regular, Menlo, monospace;white-space:pre-wrap}
`,
    });

    const title = el("h2", null, [text("Booking")]);

    const nameInput = el("input", { class: "totem-input", value: "Alex" });
    const dateInput = el("input", { class: "totem-input", value: "2026-01-27" });
    const startInput = el("input", { class: "totem-input", value: "12:00" });
    const endInput = el("input", { class: "totem-input", value: "13:00" });

    const masterInput = el("input", { class: "totem-input", value: "test-master" });
    const serviceInput = el("input", { class: "totem-input", value: "srv1" });

    const amountInput = el("input", { class: "totem-input", value: "1000" });
    const providerInput = el("input", { class: "totem-input", value: "test" });

    const log = el("div", { class: "totem-log" }, [text("Ready.")]);

    let lastRequestId = null;

    function setLog(obj) {
      log.textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
    }

    async function onCreateBooking() {
      setLog("Creating booking...");
      const payload = {
        salon_id: cfg.salonId,
        master_slug: masterInput.value.trim(),
        service_id: serviceInput.value.trim(),
        date: dateInput.value.trim(),
        start_time: startInput.value.trim(),
        end_time: endInput.value.trim(),
        client: { name: nameInput.value.trim() || "Client" },
      };

      const res = await client.createBooking(payload);
      lastRequestId = res && res.request_id ? res.request_id : null;
      setLog(res);
    }

    async function onCreateIntent() {
      if (!lastRequestId) {
        setLog("No request_id yet. Create booking first.");
        return;
      }
      setLog("Creating payment intent...");
      const payload = {
        request_id: lastRequestId,
        provider: providerInput.value.trim() || "test",
        amount: Number(amountInput.value) || 0,
      };
      const res = await client.createIntent(payload);
      setLog(res);
    }

    const form = el("div");

    form.appendChild(el("label", { class: "totem-label" }, [text("Client name")]));
    form.appendChild(nameInput);

    const row1 = el("div", { class: "totem-row" }, [
      el("div", null, [el("label", { class: "totem-label" }, [text("Date")]), dateInput]),
      el("div", null, [
        el("label", { class: "totem-label" }, [text("Start")]),
        startInput,
      ]),
      el("div", null, [el("label", { class: "totem-label" }, [text("End")]), endInput]),
    ]);

    const row2 = el("div", { class: "totem-row" }, [
      el("div", null, [
        el("label", { class: "totem-label" }, [text("Master slug")]),
        masterInput,
      ]),
      el("div", null, [
        el("label", { class: "totem-label" }, [text("Service id")]),
        serviceInput,
      ]),
    ]);

    const row3 = el("div", { class: "totem-row" }, [
      el("div", null, [
        el("label", { class: "totem-label" }, [text("Amount")]),
        amountInput,
      ]),
      el("div", null, [
        el("label", { class: "totem-label" }, [text("Provider")]),
        providerInput,
      ]),
    ]);

    const btnRow = el("div", { class: "totem-row" }, [
      el("div", null, [
        el(
          "button",
          { class: "totem-btn primary", type: "button", id: "btnBooking" },
          [text("Create booking")]
        ),
      ]),
      el("div", null, [
        el(
          "button",
          { class: "totem-btn secondary", type: "button", id: "btnIntent" },
          [text("Create payment intent")]
        ),
      ]),
    ]);

    box.appendChild(style);
    box.appendChild(title);
    box.appendChild(form);
    box.appendChild(row1);
    box.appendChild(row2);
    box.appendChild(btnRow);
    box.appendChild(row3);
    box.appendChild(log);

    host.appendChild(box);

    $("#btnBooking", "#btnBooking"); // no-op safety

    box.querySelector("#btnBooking").addEventListener("click", () => {
      onCreateBooking().catch((e) => setLog({ ok: false, error: String(e.message || e) }));
    });

    box.querySelector("#btnIntent").addEventListener("click", () => {
      onCreateIntent().catch((e) => setLog({ ok: false, error: String(e.message || e) }));
    });

    // Optional: initial health check
    client
      .health()
      .then((r) => setLog({ health: r, note: "Click Create booking" }))
      .catch(() => setLog("Health check failed (but widget still loaded)."));
  }

  window.TotemWidget = {
    mount,
  };
})();
