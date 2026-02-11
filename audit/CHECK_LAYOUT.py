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

auth_payload = {
    "jsonrpc":"2.0",
    "method":"call",
    "params":{"service":"common","method":"authenticate","args":[DB, LOGIN, API_KEY, {}]},
    "id":1
}

uid = rpc(auth_payload)["result"]

read_payload = {
    "jsonrpc":"2.0",
    "method":"call",
    "params":{
        "service":"object",
        "method":"execute_kw",
        "args":[
            DB, uid, API_KEY,
            "ir.ui.view","search_read",
            [[["key","=","website.layout"]],["id","name","arch_db"]],
            {"limit":1}
        ]
    },
    "id":2
}

layout = rpc(read_payload)["result"][0]

print("LAYOUT ID:", layout["id"])
print("NAME:", layout["name"])
print("---- START ----")
print(layout["arch_db"][:1000])
print("---- END PREVIEW ----")
