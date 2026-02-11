import requests
import base64
import os
import sys
import json
from datetime import datetime

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

ATTACH_NAME = "totem_role_check.js"
TIMEOUT = 60

def die(msg):
    print("FATAL:", msg)
    sys.exit(1)

def jsonrpc(payload):
    r = requests.post(JSONRPC, json=payload, timeout=TIMEOUT)
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
            "args": [DB, LOGIN, API_KEY, {}],
        },
        "id": 1,
    }

    auth_res = jsonrpc(auth)
    uid = auth_res.get("result")
    if not uid:
        die("AUTH FAILED")

    # SEARCH
    search = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [
                DB,
                uid,
                API_KEY,
                "ir.attachment",
                "search",
                [[["name", "=", ATTACH_NAME]]],
            ],
        },
        "id": 2,
    }

    search_res = jsonrpc(search)
    ids = search_res.get("result") or []
    if not ids:
        die("ATTACHMENT NOT FOUND")

    attach_id = ids[0]

    # READ (RAW BASE64)
    read = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [
                DB,
                uid,
                API_KEY,
                "ir.attachment",
                "read",
                [[attach_id], ["datas"]],
            ],
        },
        "id": 3,
    }

    read_res = jsonrpc(read)
    b64 = read_res["result"][0]["datas"]

    raw_bytes = base64.b64decode(b64)

    os.makedirs("audit", exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    path = f"audit\\RAW_totem_role_check_{attach_id}_{ts}.js"

    with open(path, "wb") as f:
        f.write(raw_bytes)

    print("SUCCESS")
    print("Attachment ID:", attach_id)
    print("Saved RAW file:", path)
    print("File size:", len(raw_bytes), "bytes")

if __name__ == "__main__":
    main()
