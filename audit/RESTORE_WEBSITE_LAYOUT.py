import requests
import sys
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

def main():

    auth = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"common",
            "method":"authenticate",
            "args":[DB, LOGIN, API_KEY, {}]
        },
        "id":1
    }

    uid = rpc(auth)["result"]

    # deactivate our inject view
    search = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"object",
            "method":"execute_kw",
            "args":[DB, uid, API_KEY,
                    "ir.ui.view","search",
                    [[["key","=","totem.role_gate.inject"]]]]
        },
        "id":2
    }

    ids = rpc(search)["result"]
    if ids:
        write = {
            "jsonrpc":"2.0",
            "method":"call",
            "params":{
                "service":"object",
                "method":"execute_kw",
                "args":[DB, uid, API_KEY,
                        "ir.ui.view","write",
                        [ids, {"active": False}]]
            },
            "id":3
        }
        rpc(write)
        print("Inject view disabled.")
    else:
        print("No inject view found.")

if __name__ == "__main__":
    main()
