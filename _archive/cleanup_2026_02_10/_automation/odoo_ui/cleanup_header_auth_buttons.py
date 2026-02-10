import json
import ssl
import sys
import urllib.request

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

TARGET_URLS = ["/web/login", "/web/signup"]

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
        raw = r.read().decode("utf-8", errors="replace")
    res = json.loads(raw)
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

    ids_to_delete = []

    for url in TARGET_URLS:
        rows = exec_kw(
            uid,
            "website.menu",
            "search_read",
            [[["url", "=", url]]],
            {"fields": ["id", "name", "parent_id"], "limit": 100},
        )
        for r in rows:
            ids_to_delete.append(r["id"])
            print(f"FOUND: id={r['id']} name={r.get('name')} url={url}")

    if not ids_to_delete:
        print("NOTHING TO DELETE")
        return

    exec_kw(uid, "website.menu", "unlink", [ids_to_delete])
    print(f"DELETED {len(ids_to_delete)} MENU ITEMS")

if __name__ == "__main__":
    main()
