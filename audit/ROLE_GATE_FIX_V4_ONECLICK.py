import requests, sys, json, base64, re

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

BACKEND = "https://totem-p0-api-production.up.railway.app"
LAYOUT_ID = 586
ATTACH_ID = 430

TIMEOUT = 60

def die(msg, extra=None):
    print("FATAL:", msg)
    if extra is not None:
        try:
            print(json.dumps(extra, indent=2, ensure_ascii=False))
        except Exception:
            print(extra)
    sys.exit(1)

def rpc(payload):
    r = requests.post(JSONRPC, json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        die("JSONRPC ERROR", data)
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
        die("AUTH FAILED (uid is empty). Check LOGIN/API_KEY/DB.")
    return uid

def exec_kw(uid, model, method, args, kwargs=None, _id=2):
    if kwargs is None: kwargs = {}
    payload = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{"service":"object","method":"execute_kw","args":[DB, uid, API_KEY, model, method, args, kwargs]},
        "id":_id
    }
    return rpc(payload)

def b64(s: str) -> str:
    return base64.b64encode(s.encode("utf-8")).decode("ascii")

def ensure_inject_view(uid):
    # Найдём существующий view "TOTEM Role JS Inject" (если их несколько — берём самый новый по id)
    rows = exec_kw(uid, "ir.ui.view", "search_read",
                   [[["name","=","TOTEM Role JS Inject"]], ["id","name","inherit_id","active","type","arch_db"]],
                   {"limit": 20})
    view_id = None
    if rows:
        view_id = max([x["id"] for x in rows])
    else:
        view_id = None

    arch = f"""
<data name="TOTEM Role JS Inject">
    <xpath expr="//head" position="inside">
        <script src="/web/content/{ATTACH_ID}?download=1"></script>
    </xpath>
</data>
""".strip()

    if view_id is None:
        # Создаём правильно: inherit_id = LAYOUT_ID
        create_vals = {
            "name": "TOTEM Role JS Inject",
            "type": "qweb",
            "inherit_id": LAYOUT_ID,
            "active": True,
            "arch_db": arch
        }
        new_id = exec_kw(uid, "ir.ui.view", "create", [create_vals])
        print("INJECT VIEW CREATED:", new_id)
        view_id = new_id
    else:
        # Чиним существующий: проставляем inherit_id=586 и active=True
        exec_kw(uid, "ir.ui.view", "write", [[view_id], {
            "inherit_id": LAYOUT_ID,
            "active": True,
            "type": "qweb",
            "arch_db": arch
        }])
        print("INJECT VIEW FIXED:", view_id)

    return view_id

def update_role_js_attachment(uid):
    # Новый JS: 1) гарантированно зовёт BACKEND /auth/resolve
    # 2) mapping salon_admin -> разрешить /salons/* и запретить /masters/*
    # 3) public -> блок кабинетов
    js = f"""
(function(){{
"use strict";

var API = "{BACKEND}";
var PATH = window.location.pathname || "";

function isCabinetPath(p){{
  return /^\\/salons\\/(cabinet|bookings|schedule)/.test(p) || /^\\/masters\\/(cabinet|bookings|schedule)/.test(p);
}}

function allowedForRole(role, path){{
  if (!role || role === "public") return !isCabinetPath(path);
  if (role === "salon_admin") {{
    if (path.startsWith("/salons/")) return true;
    if (path.startsWith("/masters/")) return false;
    return true;
  }}
  if (role === "master") {{
    if (path.startsWith("/masters/")) return true;
    if (path.startsWith("/salons/")) return false;
    return true;
  }}
  // default safe: block cabinets
  return !isCabinetPath(path);
}}

function redirectHome(){{
  try {{
    window.location.replace("/");
  }} catch(e) {{
    window.location.href = "/";
  }}
}}

function apply(roleData){{
  var role = (roleData && roleData.role) ? roleData.role : "public";
  if (!allowedForRole(role, PATH)) {{
    redirectHome();
    return;
  }}
  // если роль ок — ничего не делаем: страница продолжает жить
}}

fetch(API + "/auth/resolve", {{
  method: "GET",
  credentials: "include",
  headers: {{
    "Accept": "application/json"
  }}
}})
.then(function(r){{ return r.json(); }})
.then(function(data){{ apply(data); }})
.catch(function(){{ apply({{role:"public"}}); }});

}})();
""".strip()

    # Обновляем attachment 430
    # Поля: datas (base64), mimetype, public=True
    ok = exec_kw(uid, "ir.attachment", "write", [[ATTACH_ID], {
        "datas": b64(js),
        "mimetype": "application/javascript",
        "public": True
    }])
    if not ok:
        die("FAILED TO UPDATE ATTACHMENT 430")
    print("ATTACHMENT UPDATED:", ATTACH_ID)

def verify_html_contains_script():
    # Проверяем публичный HTML: должен содержать /web/content/430
    # Берём любую публичную страницу (/) — главное, что website.layout применяется.
    test_url = ODOO_URL + "/"
    r = requests.get(test_url, timeout=TIMEOUT)
    if r.status_code != 200:
        die("VERIFY FAILED: cannot GET Odoo home", {"status": r.status_code, "url": test_url})
    html = r.text
    has = (f"/web/content/{ATTACH_ID}" in html) or (f"web/content/{ATTACH_ID}" in html)
    print("VERIFY: HTML HAS /web/content/430 =", has)
    if not has:
        # Это значит: inherit view всё ещё не применяется (кэш/website mismatch) — но мы уже сделали правильную запись.
        # Дальше нужно будет только перестроить assets через Odoo (но сначала зафиксируем факт).
        die("INJECT VIEW NOT APPLIED IN RENDERED HTML. Need website-specific apply/priority.", {"checked": test_url})

def main():
    uid = auth_uid()
    ensure_inject_view(uid)
    update_role_js_attachment(uid)
    verify_html_contains_script()
    print("OK: ROLE GATE FIX V4 APPLIED")

if __name__ == "__main__":
    main()
