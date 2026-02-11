# audit/ROLE_GATE_READ_CURRENT.py
# PURPOSE: READ current Odoo attachment "totem_role_check.js"
# MODE: READ ONLY (NO MUTATIONS)

import os
import sys
import json
import base64
import datetime
import requests

ODOO_URL = os.environ.get("ODOO_URL", "").rstrip("/")
ODOO_DB = os.environ.get("ODOO_DB", "")
ODOO_LOGIN = os.environ.get("ODOO_LOGIN", "")
ODOO_API_KEY = os.environ.get("ODOO_API_KEY", "")

ATTACH_NAME = "totem_role_check.js"
TIMEOUT = 60

def die(msg):
    print("ERROR:", msg)
    sys.exit(1)

def require_env():
    missing = []
    for k, v in [
        ("ODOO_URL", ODOO_URL),
        ("ODOO_DB", ODOO_DB),
        ("ODOO_LOGIN", ODOO_LOGIN),
        ("ODOO_API_KEY", ODOO_API_KEY),
    ]:
        if not v:
            missing.append(k)
    if missing:
        die("Missing env vars: " + ", ".join(missing))

def jsonrpc(url, payload):
    r = requests.post(url, json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()

def main():
    require_env()

    jsonrpc_url = ODOO_URL + "/jsonrpc"

    # AUTH
    auth_payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "common",
            "method": "authenticate",
            "args": [ODOO_DB, ODOO_LOGIN, ODOO_API_KEY, {}],
        },
        "id": 1,
    }

    auth_res = jsonrpc(jsonrpc_url, auth_payload)
    uid = auth_res.get("result")
    if not uid:
        die("Authentication failed: " + json.dumps(auth_res, indent=2))

    # SEARCH ATTACHMENT
    search_payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [
                ODOO_DB,
                uid,
                ODOO_API_KEY,
                "ir.attachment",
                "search",
                [[["name", "=", ATTACH_NAME]]],
            ],
        },
        "id": 2,
    }

    search_res = jsonrpc(jsonrpc_url, search_payload)
    ids = search_res.get("result") or []
    if not ids:
        die("Attachment not found: " + ATTACH_NAME)

    attach_id = ids[0]

    # READ ATTACHMENT
    read_payload = {
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [
                ODOO_DB,
                uid,
                ODOO_API_KEY,
                "ir.attachment",
                "read",
                [[attach_id], ["id", "name", "datas", "mimetype", "create_date", "write_date"]],
            ],
        },
        "id": 3,
    }

    read_res = jsonrpc(jsonrpc_url, read_payload)
    rows = read_res.get("result") or []
    if not rows:
        die("Read returned empty")

    row = rows[0]
    b64 = row.get("datas") or ""

    js_content = base64.b64decode(b64).decode("utf-8", errors="ignore")

    ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    os.makedirs("audit", exist_ok=True)

    file_path = f"audit\\CURRENT_totem_role_check_{attach_id}_{ts}.js"
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(js_content)

    print("SUCCESS")
    print("Attachment ID:", attach_id)
    print("Saved to:", file_path)
    print("----- BEGIN JS CONTENT -----")
    print(js_content)
    print("----- END JS CONTENT -----")

if __name__ == "__main__":
    main()
