import requests
import sys
import json
import os
import datetime

# === HARD WIRED CONFIG ===
ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

TIMEOUT = 60
ATTACH_ROLE_JS = "totem_role_check.js"

# We will backup + replace stubs on these URLs (extend as needed)
TARGET_URLS = [
    "/salons/cabinet",
    "/salons/bookings",
    "/salons/schedule",
    "/masters/cabinet",
    "/masters/bookings",
    "/masters/schedule",
]

# Detect stub by these markers
STUB_MARKERS = [
    "ROLE GATE STUB",
    "Salon cabinet locked",
    "доступен только после подтверждения роли",
    "Odoo-админка не является ролью продукта",
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
    return data

def auth_uid():
    auth = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "common",
            "method": "authenticate",
            "args": [DB, LOGIN, API_KEY, {}],
        },
        "id": 1,
    }
    uid = rpc(auth).get("result")
    if not uid:
        die("AUTH FAILED")
    return uid

def odoo_search(uid, model, domain, limit=50):
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [DB, uid, API_KEY, model, "search", [domain], {"limit": limit}],
        },
        "id": 2,
    }
    return rpc(payload).get("result") or []

def odoo_search_read(uid, model, domain, fields, limit=50):
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [DB, uid, API_KEY, model, "search_read", [domain, fields], {"limit": limit}],
        },
        "id": 3,
    }
    return rpc(payload).get("result") or []

def odoo_read(uid, model, ids, fields):
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [DB, uid, API_KEY, model, "read", [ids, fields]],
        },
        "id": 4,
    }
    return rpc(payload).get("result") or []

def odoo_write(uid, model, ids, vals):
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [DB, uid, API_KEY, model, "write", [ids, vals]],
        },
        "id": 5,
    }
    return rpc(payload).get("result")

def ensure_role_attachment_public(uid):
    ids = odoo_search(uid, "ir.attachment", [["name", "=", ATTACH_ROLE_JS]], limit=5)
    if not ids:
        die(f"Attachment not found: {ATTACH_ROLE_JS}")
    attach_id = ids[0]
    odoo_write(uid, "ir.attachment", [attach_id], {"public": True})
    return attach_id

def page_has_stub(arch):
    a = (arch or "").lower()
    for m in STUB_MARKERS:
        if m.lower() in a:
            return True
    return False

def make_repair_arch(url, role_attach_id):
    # Visible page + shows resolve output in-page (NO DEVTOOLS)
    return f"""<template id="totem_gate_repair_{url.strip('/').replace('/','_')}" name="TOTEM Gate Repair Page">
  <t t-call="website.layout">
    <div id="wrap" class="container" style="padding:24px 0;">
      <h3>TOTEM Cabinet Gate</h3>
      <p><b>URL:</b> {url}</p>
      <div style="border:1px solid #ddd; padding:12px; border-radius:8px; margin:12px 0;">
        <div><b>Status:</b> LOADING / role-check...</div>
        <pre id="totem_resolve_dump" style="white-space:pre-wrap; margin:8px 0 0 0;">waiting…</pre>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <a class="btn btn-primary" href="/salons/cabinet">/salons/cabinet</a>
        <a class="btn btn-primary" href="/masters/cabinet">/masters/cabinet</a>
        <a class="btn btn-secondary" href="/s/totem-demo-salon">/s/totem-demo-salon</a>
      </div>

      <p style="margin-top:16px; color:#666;">
        This page is a temporary diagnostic shell. It must show /auth/resolve output below.
      </p>
    </div>

    <!-- Ensure role gate JS is present even if global inject is broken -->
    <script type="text/javascript" src="/web/content/{role_attach_id}"></script>

    <!-- Inline visible resolve probe (safe) -->
    <script type="text/javascript">
      (function(){{
        function put(x) {{
          var el = document.getElementById("totem_resolve_dump");
          if (!el) return;
          try {{ el.textContent = JSON.stringify(x, null, 2); }}
          catch(e) {{ el.textContent = String(x); }}
        }}
        fetch("/auth/resolve", {{credentials:"include"}})
          .then(function(r){{ return r.json(); }})
          .then(function(j){{ put(j); }})
          .catch(function(e){{ put({{error:String(e)}}); }});
      }})();
    </script>
  </t>
</template>
"""

def backup_write_file(path, content, is_binary=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mode = "wb" if is_binary else "w"
    with open(path, mode, encoding=None if is_binary else "utf-8") as f:
        if is_binary:
            f.write(content)
        else:
            f.write(content)

def main():
    uid = auth_uid()
    role_attach_id = ensure_role_attachment_public(uid)

    ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join("audit", f"BACKUP_REPAIR_V2_{ts}")
    os.makedirs(backup_dir, exist_ok=True)

    report = []

    for url in TARGET_URLS:
        pages = odoo_search_read(
            uid,
            "website.page",
            [["url", "=", url]],
            ["id", "url", "name", "view_id"],
            limit=5
        )

        if not pages:
            report.append({"url": url, "status": "page_not_found"})
            continue

        page = pages[0]
        page_id = page["id"]
        view_id = page["view_id"][0] if page.get("view_id") else None

        # Backup page metadata
        backup_write_file(
            os.path.join(backup_dir, f"page_{page_id}_{url.strip('/').replace('/','_')}.json"),
            json.dumps(page, indent=2, ensure_ascii=False)
        )

        if not view_id:
            report.append({"url": url, "status": "no_view_id", "page_id": page_id})
            continue

        view = odoo_read(uid, "ir.ui.view", [view_id], ["id", "key", "name", "arch_db", "active"])[0]
        arch = view.get("arch_db") or ""

        # Backup view arch
        backup_write_file(
            os.path.join(backup_dir, f"view_{view_id}_{url.strip('/').replace('/','_')}.xml"),
            arch
        )

        stub = page_has_stub(arch)

        # We replace if stub OR arch is empty-ish
        emptyish = len(arch.strip()) < 50

        if stub or emptyish:
            new_arch = make_repair_arch(url, role_attach_id)
            ok = odoo_write(uid, "ir.ui.view", [view_id], {"arch_db": new_arch, "active": True})
            report.append({
                "url": url,
                "status": "replaced_with_repair_shell",
                "page_id": page_id,
                "view_id": view_id,
                "was_stub": stub,
                "was_emptyish": emptyish,
                "write_ok": bool(ok),
            })
        else:
            report.append({
                "url": url,
                "status": "left_as_is_not_stub",
                "page_id": page_id,
                "view_id": view_id,
            })

    print("SUCCESS")
    print("ROLE JS ATTACH ID:", role_attach_id)
    print("BACKUP DIR:", backup_dir)
    print("REPORT:")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print("NEXT: open pages and hard refresh (Ctrl+F5):")
    for url in TARGET_URLS:
        print(" -", ODOO_URL + url)

if __name__ == "__main__":
    main()
