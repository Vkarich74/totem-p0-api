# ============================================================
# TOTEM — FULL ODOO BACKUP (ARCH) — V1
# PURPOSE:
#   Dump full website architecture: pages, menus, linked views
#   SAFE: READ-ONLY (no writes)
# ROOT:
#   C:\Users\Vitaly\Desktop\odoo-local
# RUN:
#   python audit\BACKUP_FULL_ODOO_ARCH_V1.py
# ============================================================

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
import urllib.request

# -----------------------------
# LOCKED INPUTS (as provided)
# -----------------------------
ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

# -----------------------------
# Output folder
# -----------------------------
def utc_tag():
    return datetime.utcnow().strftime("%Y%m%d_%H%M%SZ")

OUT_DIR = Path("audit") / f"BACKUP_FULL_ARCH_{utc_tag()}"
OUT_DIR.mkdir(parents=True, exist_ok=True)

def write_json(name: str, data):
    p = OUT_DIR / name
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(p)

def write_text(name: str, text: str):
    p = OUT_DIR / name
    p.write_text(text, encoding="utf-8")
    return str(p)

# -----------------------------
# JSON-RPC helpers (Odoo /jsonrpc)
# common.authenticate
# object.execute_kw
# -----------------------------
def rpc(service: str, method: str, args):
    payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": service,
            "method": method,
            "args": args
        },
        "id": int(datetime.utcnow().timestamp())
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(JSONRPC, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read().decode("utf-8")
        j = json.loads(raw)
    if "error" in j:
        raise RuntimeError(json.dumps(j, ensure_ascii=False, indent=2))
    return j.get("result")

def authenticate():
    uid = rpc("common", "authenticate", [DB, LOGIN, API_KEY, {}])
    if not uid:
        raise RuntimeError("AUTH FAILED: uid is empty (check DB/LOGIN/API_KEY)")
    return uid

def execute_kw(uid: int, model: str, method: str, args=None, kwargs=None):
    if args is None: args = []
    if kwargs is None: kwargs = {}
    return rpc("object", "execute_kw", [DB, uid, API_KEY, model, method, args, kwargs])

# -----------------------------
# Backup logic
# -----------------------------
def chunked(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i+n]

def safe_fname(s: str):
    s = (s or "").strip()
    s = re.sub(r"[\\/:*?\"<>|]+", "_", s)
    s = re.sub(r"\s+", " ", s).strip()
    if not s:
        s = "view"
    return s[:160]

def main():
    summary = []
    summary.append("== TOTEM ODOO FULL BACKUP (ARCH) V1 ==")
    summary.append(f"TIME_UTC: {datetime.utcnow().isoformat()}Z")
    summary.append(f"ODOO_URL: {ODOO_URL}")
    summary.append(f"DB: {DB}")
    summary.append(f"LOGIN: {LOGIN}")
    summary.append(f"OUT_DIR: {OUT_DIR}")

    try:
        uid = authenticate()
    except Exception as e:
        write_text("FATAL_AUTH.txt", f"{e}\n")
        print("FATAL: AUTH FAILED (see file in backup folder)")
        print(str(OUT_DIR / "FATAL_AUTH.txt"))
        sys.exit(2)

    summary.append(f"AUTH_UID: {uid}")

    # 1) Pages
    page_fields = ["id", "name", "url", "is_published", "website_id", "view_id", "create_date", "write_date"]
    pages = execute_kw(uid, "website.page", "search_read", args=[[] , page_fields], kwargs={"limit": 100000})
    write_json("pages.json", pages)
    summary.append(f"PAGES_COUNT: {len(pages)}")

    # 2) Menus
    menu_fields = ["id", "name", "url", "sequence", "parent_id", "website_id", "page_id", "create_date", "write_date"]
    menus = execute_kw(uid, "website.menu", "search_read", args=[[] , menu_fields], kwargs={"limit": 100000})
    write_json("menus.json", menus)
    summary.append(f"MENUS_COUNT: {len(menus)}")

    # 3) Linked Views from pages.view_id
    view_ids = []
    for p in pages:
        v = p.get("view_id")
        if isinstance(v, list) and v and isinstance(v[0], int):
            view_ids.append(v[0])
    view_ids = sorted(set(view_ids))
    summary.append(f"LINKED_VIEW_IDS: {len(view_ids)}")

    views = []
    if view_ids:
        view_fields = ["id", "name", "key", "type", "active", "inherit_id", "arch_db", "create_date", "write_date"]
        for ids in chunked(view_ids, 80):
            part = execute_kw(uid, "ir.ui.view", "read", args=[ids, view_fields], kwargs={})
            views.extend(part)

    write_json("views_linked.json", views)
    summary.append(f"VIEWS_DUMPED: {len(views)}")

    # 4) Save each view arch as XML
    xml_dir = OUT_DIR / "views_xml"
    xml_dir.mkdir(parents=True, exist_ok=True)

    saved_xml = 0
    for v in views:
        vid = v.get("id")
        nm = safe_fname(v.get("name") or v.get("key") or f"view_{vid}")
        arch = v.get("arch_db") or ""
        p = xml_dir / f"view_{vid}_{nm}.xml"
        p.write_text(arch, encoding="utf-8")
        saved_xml += 1
    summary.append(f"VIEWS_XML_FILES: {saved_xml}")

    # 5) Minimal attachments metadata (no huge binary)
    # We try to find "totem_role_check" attachment (common name) + dump by search.
    attach_fields = ["id", "name", "mimetype", "url", "public", "res_model", "res_id", "create_date", "write_date"]
    attaches = execute_kw(uid, "ir.attachment", "search_read",
                          args=[[["name", "ilike", "totem"], ["mimetype", "ilike", "javascript"]], attach_fields],
                          kwargs={"limit": 100000})
    write_json("attachments_totem_js_meta.json", attaches)
    summary.append(f"ATTACH_TOTEM_JS_META: {len(attaches)}")

    # 6) Quick index (URLs -> IDs)
    idx = []
    for p in pages:
        idx.append({
            "page_id": p.get("id"),
            "url": p.get("url"),
            "name": p.get("name"),
            "is_published": p.get("is_published"),
            "view_id": (p.get("view_id")[0] if isinstance(p.get("view_id"), list) and p.get("view_id") else None),
        })
    idx_sorted = sorted(idx, key=lambda x: (x["url"] or ""))
    write_json("index_pages_by_url.json", idx_sorted)

    # 7) Summary
    write_text("SUMMARY.txt", "\n".join(summary) + "\n")
    print("OK: BACKUP DONE")
    print(str(OUT_DIR))
    print("OPEN:", str(OUT_DIR / "SUMMARY.txt"))

if __name__ == "__main__":
    main()
