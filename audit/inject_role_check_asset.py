# inject_role_check_asset.py
# Adds global JS asset for role resolution check
# Idempotent
# Target: Odoo website assets

import os
import requests

ODOO_URL = "https://totem-platform.odoo.com"
DB = "totem-platform"
LOGIN = "kantotemus@gmail.com"
API_KEY = "710c5b2223d24bff082512e7edfbec04a38e2758"
JSONRPC = f"{ODOO_URL}/jsonrpc"

BACKEND_URL = "https://totem-p0-api-production.up.railway.app"

def jsonrpc(payload):
    r = requests.post(JSONRPC, json=payload)
    r.raise_for_status()
    return r.json()["result"]

def auth():
    return jsonrpc({
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "common",
            "method": "authenticate",
            "args": [DB, LOGIN, API_KEY, {}],
        },
        "id": 1,
    })

def exec_kw(uid, model, method, args=None, kwargs=None):
    if args is None: args = []
    if kwargs is None: kwargs = {}
    return jsonrpc({
        "jsonrpc": "2.0",
        "method": "call",
        "params": {
            "service": "object",
            "method": "execute_kw",
            "args": [DB, uid, API_KEY, model, method, args, kwargs],
        },
        "id": 2,
    })

def main():
    uid = auth()

    js_code = f"""
document.addEventListener("DOMContentLoaded", async function () {{
    const path = window.location.pathname;

    if (!path.startsWith("/masters") && !path.startsWith("/salons")) {{
        return;
    }}

    try {{
        const res = await fetch("{BACKEND_URL}/auth/resolve", {{
            credentials: "include"
        }});

        if (!res.ok) {{
            console.warn("Auth resolve failed");
            return;
        }}

        const data = await res.json();

        if (path.startsWith("/masters") && data.role !== "master") {{
            console.warn("Access denied: not master");
        }}

        if (path.startsWith("/salons") && data.role !== "salon") {{
            console.warn("Access denied: not salon");
        }}

    }} catch (e) {{
        console.error("Role check error", e);
    }}
}});
"""

    existing = exec_kw(uid, "ir.attachment", "search_read",
        [[("name", "=", "totem_role_check.js")]],
        {"fields": ["id"]}
    )

    if existing:
        exec_kw(uid, "ir.attachment", "write",
            [[existing[0]["id"]], {"datas": js_code.encode("utf-8").hex()}]
        )
        print("UPDATED existing role check asset")
    else:
        exec_kw(uid, "ir.attachment", "create", [{
            "name": "totem_role_check.js",
            "type": "binary",
            "datas": js_code.encode("utf-8").hex(),
            "mimetype": "application/javascript",
            "public": True
        }])
        print("CREATED role check asset")

if __name__ == "__main__":
    main()
