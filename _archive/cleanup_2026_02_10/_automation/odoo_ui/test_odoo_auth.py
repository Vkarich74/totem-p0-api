import json, ssl, urllib.request

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "PASTE_NEW_API_KEY_HERE"
JSONRPC = ODOO_URL + "/jsonrpc"

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def rpc(p):
    d = json.dumps(p).encode("utf-8")
    r = urllib.request.Request(JSONRPC, data=d, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, context=CTX) as f:
        j = json.loads(f.read().decode())
    if j.get("error"):
        raise Exception(j["error"])
    return j["result"]

uid = rpc({
    "jsonrpc": "2.0",
    "method": "call",
    "params": {
        "service": "common",
        "method": "authenticate",
        "args": [DB, LOGIN, API_KEY, {}]
    },
    "id": 1
})

print("UID =", uid)
