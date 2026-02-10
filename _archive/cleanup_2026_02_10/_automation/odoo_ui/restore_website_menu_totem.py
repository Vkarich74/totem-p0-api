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

    # 1) get website_id
    websites = exec_kw(
        uid,
        "website.website",
        "search_read",
        [[["id", ">", 0]]],
        {"fields": ["id", "name"], "limit": 1}
    )
    if not websites:
        die("NO WEBSITE FOUND")
    website_id = websites[0]["id"]

    # 2) read all menus
    menus = exec_kw(
        uid,
        "website.menu",
        "search_read",
        [[["id", ">", 0]]],
        {"fields": ["id", "name", "parent_id", "website_id", "sequence"], "limit": 1000}
    )

    # 3) find roots
    roots = {}
    for m in menus:
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

    # 4) enforce priority (LOWER = HIGHER PRIORITY)
    r_totem   = ensure_root("TOTEM",   1)
    r_masters = ensure_root("Мастера", 2)
    r_salons  = ensure_root("Салоны",  3)

    # 5) push default menu down
    for name, mid in roots.items():
        if name.startswith("Глав"):
            exec_kw(uid, "website.menu", "write", [[mid], {
                "sequence": 99,
                "website_id": website_id
            }])

    # 6) ensure all menus belong to this website
    all_ids = [m["id"] for m in menus]
    exec_kw(uid, "website.menu", "write", [all_ids, {"website_id": website_id}])

    print("RESTORE DONE")
    print(f"website_id={website_id}")
    print("Active roots: TOTEM(1), Мастера(2), Салоны(3)")


if __name__ == "__main__":
    main()
