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

    # 1) Find website_id from existing visible menu (Главная)
    menus = exec_kw(
        uid,
        "website.menu",
        "search_read",
        [[["url", "=", "/"]]],
        {"fields": ["id", "name", "website_id", "sequence"], "limit": 5}
    )

    if not menus:
        die("Cannot find menu '/' to detect website_id")

    website_id = menus[0]["website_id"]
    if not website_id:
        die("Detected menu '/' has no website_id")

    website_id = website_id[0]

    print(f"Detected website_id = {website_id}")

    # 2) Read ALL menus
    all_menus = exec_kw(
        uid,
        "website.menu",
        "search_read",
        [[["id", ">", 0]]],
        {"fields": ["id", "name", "url", "parent_id", "sequence"], "limit": 2000}
    )

    # 3) Detect roots
    roots = {}
    for m in all_menus:
        if not m["parent_id"]:
            roots[m["name"]] = m["id"]

    def ensure_root(name, seq):
        if name in roots:
            exec_kw(uid, "website.menu", "write", [[roots[name]], {
                "website_id": website_id,
                "sequence": seq
            }])
            return roots[name]

        rid = exec_kw(uid, "website.menu", "create", [{
            "name": name,
            "url": "#",
            "parent_id": False,
            "website_id": website_id,
            "sequence": seq
        }])
        roots[name] = rid
        return rid

    # 4) Force correct roots priority
    r_totem   = ensure_root("TOTEM",   1)
    r_masters = ensure_root("Мастера", 2)
    r_salons  = ensure_root("Салоны",  3)

    # 5) Push default menu down
    for name, mid in roots.items():
        if name.startswith("Глав"):
            exec_kw(uid, "website.menu", "write", [[mid], {
                "website_id": website_id,
                "sequence": 99
            }])

    # 6) Attach ALL menus to this website
    all_ids = [m["id"] for m in all_menus]
    exec_kw(uid, "website.menu", "write", [all_ids, {"website_id": website_id}])

    print("RESTORE DONE")
    print("Menu roots active: TOTEM / Мастера / Салоны")


if __name__ == "__main__":
    main()
