import requests
import sys
import json
import base64

# === HARD WIRED CONFIG ===
ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

TIMEOUT = 60

ATTACH_ROLE_JS = "totem_role_check.js"

# URLs we will de-stub (replace hard stub content so JS gate can run)
TARGET_URLS = [
    "/salons/bookings",
    "/salons/cabinet",
    "/masters/cabinet",
    "/masters/bookings",
]

# Heuristic markers of stub pages
STUB_MARKERS = [
    "ROLE GATE STUB",
    "Salon cabinet locked",
    "доступен только после подтверждения роли",
    "Odoo-админка не является ролью продукта",
]

# minimal page view that does NOT block and allows global JS to redirect
CLEAN_PAGE_ARCH = """<template id="totem_clean_gate_page" name="TOTEM Clean Gate Page">
  <t t-call="website.layout">
    <div id="wrap" class="container" style="padding:24px 0;">
      <h3>Loading…</h3>
      <p>TOTEM role gate is checking your session.</p>
    </div>
  </t>
</template>
"""

def die(msg):
    print("FATAL:", msg)
    sys.exit(1)

def rpc(payload):
    r = requests.post(JSONRPC, json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        die("JSONRPC ERROR:\n" + json.dumps(data, indent=2))
    return data

def auth_uid():
    auth = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"common",
            "method":"authenticate",
            "args":[DB, LOGIN, API_KEY, {}]
        },
        "id":1
    }
    uid = rpc(auth).get("result")
    if not uid:
        die("AUTH FAILED")
    return uid

def odoo_search(uid, model, domain, limit=50):
    payload = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"object",
            "method":"execute_kw",
            "args":[DB, uid, API_KEY, model, "search", [domain], {"limit": limit}]
        },
        "id":2
    }
    return rpc(payload).get("result") or []

def odoo_read(uid, model, ids, fields):
    payload = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"object",
            "method":"execute_kw",
            "args":[DB, uid, API_KEY, model, "read", [ids, fields]]
        },
        "id":3
    }
    return rpc(payload).get("result") or []

def odoo_search_read(uid, model, domain, fields, limit=50):
    payload = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"object",
            "method":"execute_kw",
            "args":[DB, uid, API_KEY, model, "search_read", [domain, fields], {"limit": limit}]
        },
        "id":4
    }
    return rpc(payload).get("result") or []

def odoo_write(uid, model, ids, vals):
    payload = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"object",
            "method":"execute_kw",
            "args":[DB, uid, API_KEY, model, "write", [ids, vals]]
        },
        "id":5
    }
    return rpc(payload).get("result")

def odoo_create(uid, model, vals):
    payload = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"object",
            "method":"execute_kw",
            "args":[DB, uid, API_KEY, model, "create", [vals]]
        },
        "id":6
    }
    return rpc(payload).get("result")

def ensure_role_attachment(uid):
    ids = odoo_search(uid, "ir.attachment", [["name","=",ATTACH_ROLE_JS]], limit=5)
    if not ids:
        die(f"Attachment not found: {ATTACH_ROLE_JS} (it must exist already)")
    attach_id = ids[0]
    # Ensure it's public (so /web/content/<id> works everywhere)
    odoo_write(uid, "ir.attachment", [attach_id], {"public": True})
    return attach_id

def ensure_inherited_inject_view(uid, base_layout_id, attach_id):
    # Create or update an inherited qweb view that injects the role check script before </body>
    key = "totem.role_gate.inject"
    existing = odoo_search(uid, "ir.ui.view", [["key","=",key]], limit=5)

    inject_arch = f"""<template id="totem_role_gate_inject" inherit_id="{base_layout_id}" name="TOTEM Role Gate Inject">
  <xpath expr="//body" position="inside">
    <script type="text/javascript" src="/web/content/{attach_id}"></script>
  </xpath>
</template>
"""

    vals = {
        "name": "TOTEM Role Gate Inject (AUTO)",
        "type": "qweb",
        "key": key,
        "arch_db": inject_arch,
        "active": True,
    }

    if existing:
        view_id = existing[0]
        odoo_write(uid, "ir.ui.view", [view_id], vals)
        return ("updated", view_id)
    else:
        view_id = odoo_create(uid, "ir.ui.view", vals)
        return ("created", view_id)

def find_base_layout(uid):
    # Try exact key first
    ids = odoo_search(uid, "ir.ui.view", [["key","=","website.layout"]], limit=5)
    if not ids:
        # Fallback: search by name contains
        rows = odoo_search_read(uid, "ir.ui.view", [["name","ilike","website.layout"]], ["id","key","name"], limit=10)
        die("website.layout not found by key. Candidates:\n" + json.dumps(rows, indent=2))
    return ids[0]

def page_has_stub(arch):
    a = (arch or "")
    for m in STUB_MARKERS:
        if m.lower() in a.lower():
            return True
    return False

def destub_pages(uid):
    report = []
    for url in TARGET_URLS:
        pages = odoo_search_read(
            uid,
            "website.page",
            [["url","=",url]],
            ["id","url","name","view_id"],
            limit=5
        )
        if not pages:
            report.append({"url": url, "status": "page_not_found"})
            continue

        page = pages[0]
        page_id = page["id"]
        view_id = page["view_id"][0] if page.get("view_id") else None
        if not view_id:
            report.append({"url": url, "status": "no_view_id", "page_id": page_id})
            continue

        view = odoo_read(uid, "ir.ui.view", [view_id], ["id","key","name","arch_db","active"])[0]
        arch = view.get("arch_db") or ""
        stub = page_has_stub(arch)

        if stub:
            ok = odoo_write(uid, "ir.ui.view", [view_id], {"arch_db": CLEAN_PAGE_ARCH, "active": True})
            report.append({
                "url": url,
                "status": "stub_replaced",
                "page_id": page_id,
                "view_id": view_id,
                "write_ok": bool(ok),
            })
        else:
            report.append({
                "url": url,
                "status": "no_stub_detected",
                "page_id": page_id,
                "view_id": view_id,
            })
    return report

def main():
    uid = auth_uid()

    base_layout_id = find_base_layout(uid)
    attach_id = ensure_role_attachment(uid)

    action, inject_view_id = ensure_inherited_inject_view(uid, base_layout_id, attach_id)
    page_report = destub_pages(uid)

    print("SUCCESS")
    print("BASE LAYOUT ID:", base_layout_id)
    print("ROLE JS ATTACH ID:", attach_id)
    print("INJECT VIEW:", action, inject_view_id)
    print("PAGES REPORT:")
    print(json.dumps(page_report, indent=2, ensure_ascii=False))
    print("NEXT: hard refresh browser (Ctrl+F5) on /salons/bookings and /masters/cabinet")

if __name__ == "__main__":
    main()
