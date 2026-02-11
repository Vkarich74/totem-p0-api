# -*- coding: utf-8 -*-
"""
TOTEM ODOO FULL BACKUP (ARCH) V1
- Dumps website pages, menus, linked views (ir.ui.view), view XML (arch_db),
  and selected JS attachments meta.
- Produces a deterministic "architecture snapshot" for rollback / audit.

Requirements: Python 3.x (no external libs)
"""

import json
import os
import sys
import time
import datetime
import urllib.request
import urllib.error


# =========================
# CONFIG (AS PROVIDED)
# =========================
ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

# What to collect
TARGET_JS_NAMES = [
    "totem_role_check.js",
    "totem_resolve_probe.js",
]

# Output base
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AUDIT_DIR = os.path.join(BASE_DIR, "BACKUP_FULL_ARCH_" + datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%SZ"))

# =========================
# JSON-RPC helpers
# =========================

_rpc_id = 0

def _rpc_call(service, method, args):
    global _rpc_id
    _rpc_id += 1
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": service,
            "method": method,
            "args": args
        },
        "id": _rpc_id
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        JSONRPC,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "TOTEM-Odoo-Backup/1.0"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            obj = json.loads(raw)
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        raise RuntimeError(f"HTTPError {e.code}: {e.reason}\n{body}") from e
    except Exception as e:
        raise RuntimeError(f"RPC transport error: {e}") from e

    if "error" in obj and obj["error"]:
        raise RuntimeError("RPC error: " + json.dumps(obj["error"], ensure_ascii=False))
    return obj.get("result")


def authenticate():
    uid = _rpc_call("common", "authenticate", [DB, LOGIN, API_KEY, {}])
    if not uid:
        raise RuntimeError("AUTH FAILED: uid is empty. Check DB/LOGIN/API_KEY.")
    return uid


def execute_kw(uid, model, method, args=None, kwargs=None):
    if args is None:
        args = []
    if kwargs is None:
        kwargs = {}
    return _rpc_call("object", "execute_kw", [DB, uid, API_KEY, model, method, args, kwargs])


# =========================
# Backup logic
# =========================

def ensure_dirs():
    os.makedirs(AUDIT_DIR, exist_ok=True)
    os.makedirs(os.path.join(AUDIT_DIR, "views_xml"), exist_ok=True)

def write_json(filename, data_obj):
    path = os.path.join(AUDIT_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data_obj, f, ensure_ascii=False, indent=2)
    return path

def write_text(filename, text):
    path = os.path.join(AUDIT_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path

def write_xml_view(view_id, xml_text):
    path = os.path.join(AUDIT_DIR, "views_xml", f"view_{view_id}.xml")
    with open(path, "w", encoding="utf-8") as f:
        # keep raw arch_db (it may contain entities)
        f.write(xml_text if xml_text is not None else "")
    return path


def backup():
    ensure_dirs()
    t0 = time.time()
    now_utc = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

    uid = authenticate()

    # ---- Pages
    # We read the full set; it's your "routes map"
    page_fields = ["id", "name", "url", "is_published", "website_id", "view_id", "create_date", "write_date"]
    pages = execute_kw(uid, "website.page", "search_read",
                       args=[[]],
                       kwargs={"fields": page_fields, "limit": 1000, "order": "id asc"})

    # Build index by url
    index_by_url = []
    for p in pages:
        index_by_url.append({
            "page_id": p.get("id"),
            "url": p.get("url"),
            "name": p.get("name"),
            "is_published": p.get("is_published"),
            "view_id": (p.get("view_id")[0] if isinstance(p.get("view_id"), list) and p.get("view_id") else p.get("view_id"))
        })

    # ---- Menus
    menu_fields = ["id", "name", "url", "sequence", "parent_id", "website_id", "page_id", "create_date", "write_date"]
    menus = execute_kw(uid, "website.menu", "search_read",
                       args=[[]],
                       kwargs={"fields": menu_fields, "limit": 2000, "order": "id asc"})

    # ---- Linked view IDs (from pages)
    linked_view_ids = []
    for p in pages:
        v = p.get("view_id")
        if isinstance(v, list) and v:
            vid = v[0]
        else:
            vid = v
        if isinstance(vid, int):
            linked_view_ids.append(vid)
    linked_view_ids = sorted(list(set(linked_view_ids)))

    views_linked = [{"view_id": vid} for vid in linked_view_ids]

    # ---- Views dump (only linked, to avoid pulling whole system)
    view_fields = ["id", "name", "key", "type", "active", "inherit_id", "arch_db", "create_date", "write_date"]
    views = []
    if linked_view_ids:
        # domain: id in linked_view_ids
        domain = [["id", "in", linked_view_ids]]
        views = execute_kw(uid, "ir.ui.view", "search_read",
                           args=[domain],
                           kwargs={"fields": view_fields, "limit": 5000, "order": "id asc"})

    # Write each view arch_db as xml file
    xml_files_written = 0
    for v in views:
        vid = v.get("id")
        arch = v.get("arch_db")
        write_xml_view(vid, arch)
        xml_files_written += 1

    # ---- Attachments: selected JS files meta (no content)
    # Odoo stores attachments in ir.attachment. We'll collect meta for your known JS names.
    attach_fields = ["id", "name", "mimetype", "url", "public", "res_model", "res_id", "create_date", "write_date"]
    attachments = []
    # domain: name in TARGET_JS_NAMES
    domain_attach = [["name", "in", TARGET_JS_NAMES]]
    attachments = execute_kw(uid, "ir.attachment", "search_read",
                             args=[domain_attach],
                             kwargs={"fields": attach_fields, "limit": 1000, "order": "id asc"})

    # ---- Output files
    write_json("pages.json", pages)
    write_json("index_pages_by_url.json", index_by_url)
    write_json("menus.json", menus)
    write_json("views_linked.json", views_linked)
    write_json("views.json", views)
    write_json("attachments_totem_js_meta.json", attachments)

    # ---- Summary
    elapsed = time.time() - t0
    summary = []
    summary.append("== TOTEM ODOO FULL BACKUP (ARCH) V1 ==")
    summary.append(f"TIME_UTC: {now_utc}")
    summary.append(f"ODOO_URL: {ODOO_URL}")
    summary.append(f"DB: {DB}")
    summary.append(f"LOGIN: {LOGIN}")
    summary.append(f"OUT_DIR: {os.path.relpath(AUDIT_DIR, BASE_DIR)}")
    summary.append(f"AUTH_UID: {uid}")
    summary.append(f"PAGES_COUNT: {len(pages)}")
    summary.append(f"MENUS_COUNT: {len(menus)}")
    summary.append(f"LINKED_VIEW_IDS: {len(linked_view_ids)}")
    summary.append(f"VIEWS_DUMPED: {len(views)}")
    summary.append(f"VIEWS_XML_FILES: {xml_files_written}")
    summary.append(f"ATTACH_TOTEM_JS_META: {len(attachments)}")
    summary.append(f"ELAPSED_SEC: {elapsed:.2f}")
    summary_text = "\n".join(summary) + "\n"
    write_text("SUMMARY.txt", summary_text)

    print(summary_text)
    print("OK: backup completed.")
    print("PATH:", AUDIT_DIR)


if __name__ == "__main__":
    try:
        backup()
    except Exception as e:
        print("FAILED:", str(e))
        sys.exit(1)
