import requests
import json

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

def rpc(payload):
    r = requests.post(JSONRPC, json=payload, timeout=60)
    r.raise_for_status()
    return r.json()

# AUTH
auth = {
    "jsonrpc": "2.0",
    "method": "call",
    "params": {
        "service": "common",
        "method": "authenticate",
        "args": [DB, LOGIN, API_KEY, {}]
    },
    "id": 1
}

uid = rpc(auth)["result"]

# READ LAYOUT
read_layout = {
    "jsonrpc": "2.0",
    "method": "call",
    "params": {
        "service": "object",
        "method": "execute_kw",
        "args": [
            DB, uid, API_KEY,
            "ir.ui.view", "search_read",
            [[["key", "=", "website.layout"]], ["id", "arch_db"]],
            {"limit": 1}
        ]
    },
    "id": 2
}

layout = rpc(read_layout)["result"][0]
arch = layout["arch_db"]

print("LAYOUT ID:", layout["id"])
print("HAS totem_role_check:", "totem_role_check" in arch)
print("HAS web/content:", "/web/content/" in arch)
