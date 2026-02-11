import requests
import sys
import json

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

PROBE_NAME = "totem_resolve_probe.js"

def die(msg):
    print("FATAL:", msg)
    sys.exit(1)

def rpc(payload):
    r = requests.post(JSONRPC, json=payload, timeout=60)
    r.raise_for_status()
    return r.json()

def main():

    # AUTH
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

    # FIND PROBE ATTACHMENT
    search_attach = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"object",
            "method":"execute_kw",
            "args":[
                DB, uid, API_KEY,
                "ir.attachment","search",
                [[["name","=",PROBE_NAME]]]
            ]
        },
        "id":2
    }

    ids = rpc(search_attach).get("result") or []
    if not ids:
        die("PROBE NOT FOUND")

    attach_id = ids[0]

    # FIND website.layout
    search_view = {
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
        "id":3
    }

    view_ids = rpc(search_view).get("result") or []
    if not view_ids:
        die("website.layout NOT FOUND")

    view_id = view_ids[0]

    # READ VIEW
    read_view = {
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
        "id":4
    }

    arch = rpc(read_view)["result"][0]["arch_db"]

    inject_line = f'<script src="/web/content/{attach_id}"></script>'

    if inject_line in arch:
        print("ALREADY INJECTED")
        return

    new_arch = arch.replace("</body>", inject_line + "\n</body>")

    write_view = {
        "jsonrpc":"2.0",
        "method":"call",
        "params":{
            "service":"object",
            "method":"execute_kw",
            "args":[
                DB, uid, API_KEY,
                "ir.ui.view","write",
                [[view_id],{"arch_db":new_arch}]
            ]
        },
        "id":5
    }

    rpc(write_view)

    print("PROBE INJECTED INTO LAYOUT")
    print("Refresh any page now.")

if __name__ == "__main__":
    main()
