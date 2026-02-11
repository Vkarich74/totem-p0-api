import requests
import sys
import json

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

BACKEND_BASE = "https://totem-p0-api-production.up.railway.app"
ASSET_NAME = "totem_role_check.js"

TIMEOUT = 60

# Views we must force into website.layout (LAW) + show stub content
VIEW_IDS_TO_WRAP = [
    (2263, "Salon cabinet locked", "/salons/cabinet"),
    (2233, "Salon cabinet locked", "/salons/schedule"),
    (2234, "Salon cabinet locked", "/salons/bookings"),
    (2262, "Master cabinet locked", "/masters/cabinet"),
    (2241, "Master cabinet locked", "/masters/schedule"),
    (2242, "Master cabinet locked", "/masters/bookings"),
]

def die(msg):
    print("FATAL:", msg)
    sys.exit(1)

def rpc(payload):
    r = requests.post(JSONRPC, json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        die("JSONRPC ERROR:\n" + json.dumps(data, indent=2, ensure_ascii=False))
    return data.get("result")

def auth_uid():
    payload = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{"service":"common","method":"authenticate","args":[DB, LOGIN, API_KEY, {}]},
        "id":1
    }
    uid = rpc(payload)
    if not uid:
        die("AUTH FAILED")
    return uid

def execute_kw(uid, model, method, args, kwargs=None):
    payload = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"object",
            "method":"execute_kw",
            "args":[DB, uid, API_KEY, model, method, args, kwargs or {}]
        },
        "id":2
    }
    return rpc(payload)

def wrap_stub_in_layout(title, url):
    # Must be inside website.layout
    return f"""<t t-name="totem.role_gate.stub.layout">
  <t t-call="website.layout">
    <div id="wrap" class="oe_structure">
      <section class="container py-5">
        <div class="row justify-content-center">
          <div class="col-lg-7">
            <div class="card shadow-sm">
              <div class="card-body p-4">
                <h2 class="mb-2">{title}</h2>
                <p class="text-muted mb-4">URL: {url}</p>

                <div class="alert alert-warning" role="alert">
                  Этот раздел доступен только после подтверждения роли (Master/Salon) через ядро TOTEM (backend).
                  Odoo-админка не является ролью продукта.
                </div>

                <div class="d-flex gap-2 flex-wrap">
                  <a class="btn btn-primary" href="/start">Start</a>
                  <a class="btn btn-outline-secondary" href="/waitlist">Waitlist</a>
                  <a class="btn btn-link" href="/">Home</a>
                </div>

                <hr class="my-4"/>
                <p class="small text-muted mb-0">
                  Статус: ROLE GATE (v3). Вход: /start?totem_email=...
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </t>
</t>"""

def role_check_js():
    # 1) supports /start?totem_email=...
    # 2) calls backend /auth/login and /auth/resolve with credentials
    # 3) mapping: salon_admin => allow /salons/*, deny /masters/*
    return f"""(function () {{
  "use strict";

  var BACKEND = "{BACKEND_BASE}";
  var ALLOW_SALON = /^\\/salons\\//;
  var ALLOW_MASTER = /^\\/masters\\//;

  function qs(name) {{
    try {{
      var u = new URL(window.location.href);
      return u.searchParams.get(name);
    }} catch (e) {{
      return null;
    }}
  }}

  function setStatus(msg) {{
    try {{
      var el = document.getElementById("totem_gate_status");
      if (!el) {{
        el = document.createElement("div");
        el.id = "totem_gate_status";
        el.style.position = "fixed";
        el.style.right = "10px";
        el.style.bottom = "10px";
        el.style.background = "#111";
        el.style.color = "#0f0";
        el.style.padding = "8px 10px";
        el.style.fontSize = "12px";
        el.style.zIndex = "999999";
        el.style.borderRadius = "8px";
        document.body.appendChild(el);
      }}
      el.textContent = "TOTEM: " + msg;
    }} catch (e) {{}}
  }}

  function postLogin(email) {{
    setStatus("login...");
    return fetch(BACKEND + "/auth/login", {{
      method: "POST",
      headers: {{ "Content-Type": "application/json" }},
      credentials: "include",
      body: JSON.stringify({{ email: email }})
    }}).then(function (r) {{
      return r.json();
    }});
  }}

  function resolveRole() {{
    return fetch(BACKEND + "/auth/resolve", {{
      method: "GET",
      credentials: "include"
    }}).then(function (r) {{
      return r.json();
    }});
  }}

  function gate(data) {{
    var role = (data && data.role) ? data.role : "public";
    var path = window.location.pathname || "/";

    // Mapping required by contract
    // salon_admin => allow /salons/* ; block /masters/*
    if (role === "salon_admin") {{
      if (ALLOW_MASTER.test(path)) {{
        setStatus("role salon_admin -> redirect /salons/cabinet");
        window.location.replace("/salons/cabinet");
        return;
      }}
      setStatus("role salon_admin OK");
      return;
    }}

    // public (or any other) => block both cabinets (stay on stub)
    setStatus("role " + role + " (blocked)");
  }}

  function main() {{
    var email = qs("totem_email");
    if (email) {{
      try {{
        localStorage.setItem("totem_email", email);
      }} catch (e) {{}}
      postLogin(email).then(function () {{
        // clean URL
        var u = new URL(window.location.href);
        u.searchParams.delete("totem_email");
        window.history.replaceState({{}}, "", u.toString());
        return resolveRole();
      }}).then(gate).catch(function (e) {{
        setStatus("login/resolve error");
        console.error("TOTEM gate error", e);
      }});
      return;
    }}

    resolveRole().then(gate).catch(function (e) {{
      setStatus("resolve error");
      console.error("TOTEM resolve error", e);
    }});
  }}

  if (document.readyState === "loading") {{
    document.addEventListener("DOMContentLoaded", main);
  }} else {{
    main();
  }}
}})();
"""

def ensure_attachment(uid):
    # Find existing attachment by name
    found = execute_kw(uid, "ir.attachment", "search_read",
                       [[["name","=",ASSET_NAME]], ["id","name","mimetype","url","datas"]],
                       {"limit": 1})
    js_bytes = role_check_js().encode("utf-8")
    import base64
    datas = base64.b64encode(js_bytes).decode("ascii")

    if found:
        att_id = found[0]["id"]
        execute_kw(uid, "ir.attachment", "write", [[att_id], {
            "mimetype": "text/javascript",
            "datas": datas,
            "name": ASSET_NAME
        }])
        print("ATTACHMENT UPDATED:", att_id)
        return att_id

    att_id = execute_kw(uid, "ir.attachment", "create", [[{
        "name": ASSET_NAME,
        "mimetype": "text/javascript",
        "datas": datas
    }]])
    print("ATTACHMENT CREATED:", att_id)
    return att_id

def inject_into_layout(uid, attach_id):
    # Get website.layout view
    layout = execute_kw(uid, "ir.ui.view", "search_read",
                        [[["key","=","website.layout"]], ["id","key","arch_db"]],
                        {"limit": 1})
    if not layout:
        die("website.layout not found")
    layout_id = layout[0]["id"]
    arch = layout[0]["arch_db"] or ""

    tag = f'/web/content/{attach_id}?download=1'
    needle = tag

    if needle in arch:
        print("LAYOUT already has asset:", tag)
        return layout_id

    # Insert script before closing </head> if possible
    script_tag = f'<script src="{tag}"></script>'

    if "</head>" in arch:
        new_arch = arch.replace("</head>", script_tag + "\n</head>", 1)
    else:
        # fallback: append at end (should still work)
        new_arch = arch + "\n" + script_tag + "\n"

    execute_kw(uid, "ir.ui.view", "write", [[layout_id], {"arch_db": new_arch}])
    print("LAYOUT injected asset:", tag)
    return layout_id

def wrap_views(uid):
    for vid, title, url in VIEW_IDS_TO_WRAP:
        arch = wrap_stub_in_layout(title, url)
        execute_kw(uid, "ir.ui.view", "write", [[vid], {"arch_db": arch, "active": True}])
        print("VIEW WRAPPED IN website.layout:", vid, url)

def main():
    uid = auth_uid()
    att_id = ensure_attachment(uid)
    inject_into_layout(uid, att_id)
    wrap_views(uid)
    print("SUCCESS: ROLE_GATE_SYNC_V3_DONE")
    print("NEXT: open /start?totem_email=kantotemus@gmail.com then visit /salons/cabinet")

if __name__ == "__main__":
    main()
