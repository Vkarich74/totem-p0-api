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

def rpc(payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(JSONRPC, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
        res = json.loads(r.read().decode("utf-8"))
    if res.get("error"):
        print(json.dumps(res["error"], indent=2, ensure_ascii=False))
        sys.exit(1)
    return res["result"]

uid = rpc({
    "jsonrpc": "2.0",
    "method": "call",
    "params": {
        "service": "common",
        "method": "login",
        "args": [DB, LOGIN, API_KEY]
    },
    "id": 1
})

print("UID =", uid)

if not uid:
    print("AUTH FAIL: API_KEY invalid/revoked OR LOGIN/DB mismatch")
    sys.exit(2)

# минимальная проверка прав: прочитать 1 меню
menus = rpc({
    "jsonrpc": "2.0",
    "method": "call",
    "params": {
        "service": "object",
        "method": "execute_kw",
        "args": [DB, uid, API_KEY, "website.menu", "search_read", [[]], {"fields": ["id", "name", "url"], "limit": 3}]
    },
    "id": 2
})

print("MENUS SAMPLE:")
for m in menus:
    print(m["id"], m["name"], m.get("url"))
