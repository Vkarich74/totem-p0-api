import requests
import json
import sys

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

def die(msg):
    print("FATAL:", msg)
    sys.exit(1)

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

    uid = rpc(auth).get("result")
    if not uid:
        die("AUTH FAILED")

    search = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"object",
            "method":"execute_kw",
            "args":[
                DB, uid, API_KEY,
                "ir.ui.view","search",
                [[["key","=","website.layout"]]]
            ]
        },
        "id":2
    }

    ids = rpc(search).get("result") or []
    if not ids:
        die("website.layout NOT FOUND")

    view_id = ids[0]

    read = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"object",
            "method":"execute_kw",
            "args":[
                DB, uid, API_KEY,
                "ir.ui.view","read",
                [[view_id],["arch_db"]]
            ]
        },
        "id":3
    }

    arch = rpc(read)["result"][0]["arch_db"]

    print("LAYOUT LENGTH:", len(arch))
    print("HAS STUB:", "ROLE GATE STUB" in arch)
    print("HAS totem_role_check:", "totem_role_check" in arch)

if __name__ == "__main__":
    main()
