import requests
import sys
import json

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

ATTACH_ID = 430  # твой существующий totem_role_check.js

def rpc(payload):
    r = requests.post(JSONRPC, json=payload, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        print(json.dumps(data, indent=2, ensure_ascii=False))
        sys.exit(1)
    return data["result"]

# AUTH
auth = {
    "jsonrpc":"2.0",
    "method":"call",
    "params":{"service":"common","method":"authenticate","args":[DB, LOGIN, API_KEY, {}]},
    "id":1
}

uid = rpc(auth)

# CREATE INHERIT VIEW
arch = f"""
<data inherit_id="website.layout" name="TOTEM Role JS Inject">
    <xpath expr="//head" position="inside">
        <script src="/web/content/{ATTACH_ID}?download=1"></script>
    </xpath>
</data>
"""

create_view = {
    "jsonrpc":"2.0",
    "method":"call",
    "params":{
        "service":"object",
        "method":"execute_kw",
        "args":[
            DB, uid, API_KEY,
            "ir.ui.view","create",
            [{
                "name":"TOTEM Role JS Inject",
                "type":"qweb",
                "arch_db":arch
            }]
        ]
    },
    "id":2
}

view_id = rpc(create_view)
print("INHERIT VIEW CREATED:", view_id)
print("DONE")
