import json
import ssl
import sys
import urllib.request

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def die(msg):
    print(msg)
    sys.exit(1)

def rpc(payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        JSONRPC,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
        res = json.loads(r.read().decode("utf-8", "replace"))
    if "error" in res and res["error"]:
        die(json.dumps(res["error"], indent=2, ensure_ascii=False))
    return res.get("result")

def login():
    uid = rpc({
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "common",
            "method": "login",
            "args": [DB, LOGIN, API_KEY],
        },
        "id": 1
    })
    if not uid:
        die("LOGIN FAILED")
    return uid

def exec_kw(uid, model, method, args=None, kwargs=None):
    return rpc({
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [DB, uid, API_KEY, model, method, args or [], kwargs or {}],
        },
        "id": 1
    })

def main():
    uid = login()

    # 1) read all menus
    menus = exec_kw(
        uid,
        "website.menu",
        "search_read",
        [[["id", ">", 0]]],
        {"fields": ["id", "name", "url", "parent_id"], "limit": 1000},
    )

    by_name_root = {
        m["name"]: m["id"]
        for m in menus
        if not m["parent_id"]
    }

    def ensure_root(name):
        if name in by_name_root:
            return by_name_root[name]
        rid = exec_kw(uid, "website.menu", "create", [{
            "name": name,
            "url": "#",
            "parent_id": False,
            "sequence": 100,
        }])
        by_name_root[name] = rid
        return rid

    r_masters = ensure_root("Мастера")
    r_salons  = ensure_root("Салоны")
    r_totem   = ensure_root("TOTEM")

    # 2) relocate items (NO DELETES)
    for m in menus:
        url = m.get("url") or ""
        mid = m["id"]

        if url.startswith("/masters/"):
            exec_kw(uid, "website.menu", "write", [[mid], {"parent_id": r_masters}])
        elif url.startswith("/salons/"):
            exec_kw(uid, "website.menu", "write", [[mid], {"parent_id": r_salons}])
        elif url.startswith("/s/:slug"):
            exec_kw(uid, "website.menu", "write", [[mid], {"parent_id": r_totem}])

    # 3) re-read AFTER relocation
    menus2 = exec_kw(
        uid,
        "website.menu",
        "search_read",
        [[["id", ">", 0]]],
        {"fields": ["id", "url"], "limit": 1000},
    )

    seen = {}
    to_delete = []

    for m in menus2:
        url = m.get("url")
        if not url:
            continue
        if url in seen:
            to_delete.append(m["id"])
        else:
            seen[url] = m["id"]

    # 4) delete duplicates SAFELY
    if to_delete:
        exec_kw(uid, "website.menu", "unlink", [to_delete])

    print("FIX DONE")
    print(f"duplicates removed: {len(to_delete)}")

if __name__ == "__main__":
    main()
