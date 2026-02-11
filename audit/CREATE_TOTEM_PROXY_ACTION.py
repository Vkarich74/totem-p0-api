import requests
import sys

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

BACKEND_BASE = "https://totem-p0-api-production.up.railway.app"

def rpc(payload):
    r = requests.post(JSONRPC, json=payload, timeout=60)
    r.raise_for_status()
    return r.json()

def main():
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
    if not uid:
        print("AUTH FAILED")
        sys.exit(1)

    code = f"""
import requests
response = requests.get("{BACKEND_BASE}/auth/resolve", timeout=10)
result = response.json()
"""

    create = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [
                DB,
                uid,
                API_KEY,
                "ir.actions.server",
                "create",
                [{
                    "name": "TOTEM Proxy Resolve",
                    "state": "code",
                    "code": code
                }]
            ]
        },
        "id": 2
    }

    action_id = rpc(create)["result"]
    print("CREATED ACTION ID:", action_id)

if __name__ == "__main__":
    main()
